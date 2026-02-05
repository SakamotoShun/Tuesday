import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from '../config';
import { fileRepository } from '../repositories';
import { projectService } from './project';
import type { File as FileRecord } from '../db/schema';
import type { User } from '../types';

interface UploadFile {
  name: string;
  type: string;
  size: number;
  arrayBuffer: () => Promise<ArrayBuffer>;
}

export interface FileResponse {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: Date;
  uploadedBy: string;
  url: string;
}

const matchesMimeType = (allowed: string, target: string) => {
  if (allowed.endsWith('/*')) {
    const prefix = allowed.slice(0, -1);
    return target.startsWith(prefix);
  }
  return allowed === target;
};

export class FileService {
  async upload(file: UploadFile, user: User): Promise<FileResponse> {
    if (!file || typeof file.arrayBuffer !== 'function') {
      throw new Error('Invalid file upload');
    }

    const maxBytes = config.uploadMaxSizeMb * 1024 * 1024;
    if (file.size > maxBytes) {
      throw new Error(`File exceeds ${config.uploadMaxSizeMb}MB limit`);
    }

    if (!file.type || !config.uploadAllowedTypes.some((allowed) => matchesMimeType(allowed, file.type))) {
      throw new Error('File type is not allowed');
    }

    await mkdir(config.uploadStoragePath, { recursive: true });

    const extension = extname(file.name || '');
    const storedName = `${randomUUID()}${extension}`;
    const storagePath = join(config.uploadStoragePath, storedName);

    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(storagePath, buffer);

    const expiresAt = new Date(Date.now() + config.uploadPendingTtlMinutes * 60 * 1000);
    const record = await fileRepository.create({
      originalName: file.name || 'upload',
      storedName,
      mimeType: file.type,
      sizeBytes: file.size,
      storagePath,
      uploadedBy: user.id,
      status: 'pending',
      expiresAt,
    });

    return this.toResponse(record);
  }

  async getFileForUser(fileId: string, user: User): Promise<{ file: FileRecord; response: FileResponse }> {
    const context = await fileRepository.findAttachmentContext(fileId);
    if (!context) {
      const file = await fileRepository.findById(fileId);
      if (!file) {
        throw new Error('File not found');
      }
      if (user.role !== 'admin' && file.uploadedBy !== user.id) {
        throw new Error('Access denied');
      }
      return { file, response: this.toResponse(file) };
    }

    if (context.message.deletedAt) {
      throw new Error('File is no longer available');
    }

    if (context.channel.type === 'project') {
      if (!context.channel.projectId) {
        throw new Error('Channel has no project');
      }
      const hasAccess = await projectService.hasAccess(context.channel.projectId, user);
      if (!hasAccess) {
        throw new Error('Access denied');
      }
    }

    return { file: context.file, response: this.toResponse(context.file) };
  }

  async deleteFile(fileId: string, user: User): Promise<boolean> {
    const file = await fileRepository.findById(fileId);
    if (!file) {
      throw new Error('File not found');
    }

    if (user.role !== 'admin' && file.uploadedBy !== user.id) {
      throw new Error('You do not have permission to delete this file');
    }

    // Allow deletion of pending files without attachment check
    if (file.status !== 'pending') {
      const attached = await fileRepository.isAttached(fileId);
      if (attached) {
        throw new Error('File is attached to a message');
      }
    }

    await fileRepository.delete(fileId);

    try {
      await unlink(file.storagePath);
    } catch {
      // ignore file system delete errors
    }

    return true;
  }

  async markAttached(fileIds: string[]): Promise<void> {
    await fileRepository.updateStatus(fileIds, 'attached');
  }

  async markAsAvatar(fileId: string): Promise<void> {
    await fileRepository.updateStatus([fileId], 'avatar');
  }

  async deleteAvatarFile(fileId: string): Promise<boolean> {
    const file = await fileRepository.findById(fileId);
    if (!file) {
      return false;
    }

    // Only delete if it's an avatar file
    if (file.status !== 'avatar') {
      return false;
    }

    await fileRepository.delete(fileId);

    try {
      await unlink(file.storagePath);
    } catch {
      // ignore file system delete errors
    }

    return true;
  }

  async cleanupExpiredFiles(): Promise<number> {
    const expired = await fileRepository.findExpired();
    
    for (const file of expired) {
      try {
        await unlink(file.storagePath);
      } catch {
        // ignore file system delete errors
      }
    }
    
    return fileRepository.deleteExpired();
  }

  /**
   * Delete all files attached to messages in a project's channels.
   * Call this BEFORE deleting the project to clean up physical files.
   */
  async cleanupProjectFiles(projectId: string): Promise<number> {
    const files = await fileRepository.findByProjectId(projectId);
    return this.deleteFilesFromDisk(files);
  }

  /**
   * Delete all files attached to messages in a channel.
   * Call this BEFORE deleting the channel to clean up physical files.
   */
  async cleanupChannelFiles(channelId: string): Promise<number> {
    const files = await fileRepository.findByChannelId(channelId);
    return this.deleteFilesFromDisk(files);
  }

  /**
   * Delete all files uploaded by a user.
   * Call this BEFORE deleting the user to clean up physical files.
   */
  async cleanupUserFiles(userId: string): Promise<number> {
    const files = await fileRepository.findByUploaderId(userId);
    return this.deleteFilesFromDisk(files);
  }

  /**
   * Delete files attached to soft-deleted messages older than X days.
   * This is called periodically to clean up files from deleted messages.
   */
  async cleanupDeletedMessageFiles(olderThanDays: number): Promise<number> {
    const files = await fileRepository.findFromDeletedMessages(olderThanDays);
    if (files.length === 0) return 0;

    // Delete physical files
    for (const file of files) {
      try {
        await unlink(file.storagePath);
      } catch {
        // ignore file system delete errors
      }
    }

    // Delete database records
    const fileIds = files.map((f) => f.id);
    return fileRepository.deleteByIds(fileIds);
  }

  /**
   * Delete orphaned files (marked as 'attached' but no longer referenced).
   * This catches edge cases where files were orphaned unexpectedly.
   */
  async cleanupOrphanedFiles(): Promise<number> {
    const files = await fileRepository.findOrphaned();
    return this.deleteFilesFromDisk(files);
  }

  /**
   * Helper to delete files from disk and database
   */
  private async deleteFilesFromDisk(files: FileRecord[]): Promise<number> {
    if (files.length === 0) return 0;

    // Delete physical files
    for (const file of files) {
      try {
        await unlink(file.storagePath);
      } catch {
        // ignore file system delete errors
      }
    }

    // Delete database records
    const fileIds = files.map((f) => f.id);
    return fileRepository.deleteByIds(fileIds);
  }

  toResponse(file: FileRecord): FileResponse {
    return {
      id: file.id,
      originalName: file.originalName,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      createdAt: file.createdAt,
      uploadedBy: file.uploadedBy,
      url: `/api/v1/files/${file.id}`,
    };
  }
}

export const fileService = new FileService();

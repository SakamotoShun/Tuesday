import { and, eq, inArray, isNotNull, isNull, lt, notExists } from 'drizzle-orm';
import { db } from '../db/client';
import { files, messageAttachments, messages, channels, type File, type NewFile } from '../db/schema';

export type FileAttachmentContext = {
  file: File;
  message: { id: string; channelId: string; deletedAt: Date | null };
  channel: { id: string; type: string; projectId: string | null; archivedAt: Date | null };
};

export class FileRepository {
  async create(data: NewFile): Promise<File> {
    const [file] = await db.insert(files).values(data).returning();
    return file;
  }

  async findById(id: string): Promise<File | null> {
    const result = await db.query.files.findFirst({
      where: eq(files.id, id),
    });
    return result || null;
  }

  async findByIds(ids: string[]): Promise<File[]> {
    if (ids.length === 0) return [];
    return db.query.files.findMany({
      where: inArray(files.id, ids),
    });
  }

  async findAttachedFileIds(ids: string[]): Promise<string[]> {
    if (ids.length === 0) return [];
    const result = await db
      .select({ fileId: messageAttachments.fileId })
      .from(messageAttachments)
      .where(inArray(messageAttachments.fileId, ids));
    return result.map((row) => row.fileId);
  }

  async isAttached(fileId: string): Promise<boolean> {
    const result = await db
      .select({ fileId: messageAttachments.fileId })
      .from(messageAttachments)
      .where(eq(messageAttachments.fileId, fileId))
      .limit(1);
    return result.length > 0;
  }

  async delete(id: string): Promise<boolean> {
    const result = await db.delete(files).where(eq(files.id, id)).returning();
    return result.length > 0;
  }

  async findAttachmentContext(fileId: string): Promise<FileAttachmentContext | null> {
    const result = await db
      .select({
        file: files,
        message: {
          id: messages.id,
          channelId: messages.channelId,
          deletedAt: messages.deletedAt,
        },
        channel: {
          id: channels.id,
          type: channels.type,
          projectId: channels.projectId,
          archivedAt: channels.archivedAt,
        },
      })
      .from(files)
      .innerJoin(messageAttachments, eq(messageAttachments.fileId, files.id))
      .innerJoin(messages, eq(messages.id, messageAttachments.messageId))
      .innerJoin(channels, eq(channels.id, messages.channelId))
      .where(eq(files.id, fileId))
      .limit(1);

    return result[0] ?? null;
  }

  async updateStatus(ids: string[], status: string): Promise<void> {
    if (ids.length === 0) return;
    await db.update(files)
      .set({ status, expiresAt: null })
      .where(inArray(files.id, ids));
  }

  async findExpired(): Promise<File[]> {
    return db.query.files.findMany({
      where: and(
        eq(files.status, 'pending'),
        lt(files.expiresAt, new Date())
      ),
    });
  }

  async deleteExpired(): Promise<number> {
    const result = await db.delete(files)
      .where(and(
        eq(files.status, 'pending'),
        lt(files.expiresAt, new Date())
      ))
      .returning();
    return result.length;
  }

  /**
   * Find all files attached to messages in a specific project's channels
   */
  async findByProjectId(projectId: string): Promise<File[]> {
    const result = await db
      .select({ file: files })
      .from(files)
      .innerJoin(messageAttachments, eq(messageAttachments.fileId, files.id))
      .innerJoin(messages, eq(messages.id, messageAttachments.messageId))
      .innerJoin(channels, eq(channels.id, messages.channelId))
      .where(eq(channels.projectId, projectId));
    return result.map((row) => row.file);
  }

  /**
   * Find all files attached to messages in a specific channel
   */
  async findByChannelId(channelId: string): Promise<File[]> {
    const result = await db
      .select({ file: files })
      .from(files)
      .innerJoin(messageAttachments, eq(messageAttachments.fileId, files.id))
      .innerJoin(messages, eq(messages.id, messageAttachments.messageId))
      .where(eq(messages.channelId, channelId));
    return result.map((row) => row.file);
  }

  /**
   * Find all files uploaded by a specific user
   */
  async findByUploaderId(userId: string): Promise<File[]> {
    return db.query.files.findMany({
      where: eq(files.uploadedBy, userId),
    });
  }

  /**
   * Find files attached to soft-deleted messages older than X days
   */
  async findFromDeletedMessages(olderThanDays: number): Promise<File[]> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const result = await db
      .select({ file: files })
      .from(files)
      .innerJoin(messageAttachments, eq(messageAttachments.fileId, files.id))
      .innerJoin(messages, eq(messages.id, messageAttachments.messageId))
      .where(and(
        isNotNull(messages.deletedAt),
        lt(messages.deletedAt, cutoffDate)
      ));
    return result.map((row) => row.file);
  }

  /**
   * Find orphaned files (status='attached' but no messageAttachments reference)
   */
  async findOrphaned(): Promise<File[]> {
    const result = await db
      .select()
      .from(files)
      .where(and(
        eq(files.status, 'attached'),
        notExists(
          db.select({ id: messageAttachments.fileId })
            .from(messageAttachments)
            .where(eq(messageAttachments.fileId, files.id))
        )
      ));
    return result;
  }

  /**
   * Bulk delete files by IDs
   */
  async deleteByIds(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    const result = await db.delete(files)
      .where(inArray(files.id, ids))
      .returning();
    return result.length;
  }
}

export const fileRepository = new FileRepository();

import { eq, inArray } from 'drizzle-orm';
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
}

export const fileRepository = new FileRepository();

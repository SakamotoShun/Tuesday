import { and, desc, eq, gt, isNull, lt, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { messageAttachments, messages, type Message, type MessageReaction, type NewMessage, type File } from '../db/schema';

export type MessageWithUser = Message & {
  user: { id: string; name: string; email: string; avatarUrl: string | null };
  bot?: { id: string; name: string; avatarUrl: string | null } | null;
  attachments?: Array<{ file: File; sortOrder: number; fileId: string; messageId: string }>;
  reactions?: MessageReaction[];
};

export interface MessageQueryOptions {
  before?: Date;
  limit?: number;
}

export class MessageRepository {
  async findById(id: string): Promise<MessageWithUser | null> {
    const result = await db.query.messages.findFirst({
      where: eq(messages.id, id),
      with: {
        user: {
          columns: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
          },
        },
        bot: {
          columns: {
            id: true,
            name: true,
            avatarUrl: true,
          },
        },
        attachments: {
          with: {
            file: true,
          },
          orderBy: [messageAttachments.sortOrder],
        },
        reactions: true,
      },
    });
    return result || null;
  }

  async findByChannelId(channelId: string, options?: MessageQueryOptions): Promise<MessageWithUser[]> {
    const conditions = [eq(messages.channelId, channelId)];

    if (options?.before) {
      conditions.push(lt(messages.createdAt, options.before));
    }

    const result = await db.query.messages.findMany({
      where: and(...conditions),
      with: {
        user: {
          columns: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
          },
        },
        bot: {
          columns: {
            id: true,
            name: true,
            avatarUrl: true,
          },
        },
        attachments: {
          with: {
            file: true,
          },
          orderBy: [messageAttachments.sortOrder],
        },
        reactions: true,
      },
      orderBy: [desc(messages.createdAt)],
      limit: options?.limit ?? 50,
    });

    return result;
  }

  async create(data: NewMessage): Promise<Message> {
    const [message] = await db.insert(messages).values(data).returning();
    return message;
  }

  async update(id: string, data: Partial<NewMessage>): Promise<Message | null> {
    const [message] = await db
      .update(messages)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(messages.id, id))
      .returning();
    return message || null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await db.delete(messages).where(eq(messages.id, id)).returning();
    return result.length > 0;
  }

  async addAttachments(messageId: string, fileIds: string[]): Promise<void> {
    if (fileIds.length === 0) return;
    const rows = fileIds.map((fileId, index) => ({
      messageId,
      fileId,
      sortOrder: index,
    }));
    await db.insert(messageAttachments).values(rows);
  }

  async softDelete(id: string): Promise<Message | null> {
    const [message] = await db
      .update(messages)
      .set({ deletedAt: new Date(), content: '', updatedAt: new Date() })
      .where(eq(messages.id, id))
      .returning();
    return message || null;
  }

  async countUnread(channelId: string, lastReadAt: Date): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(messages)
      .where(and(
        eq(messages.channelId, channelId),
        gt(messages.createdAt, lastReadAt),
        isNull(messages.deletedAt)
      ));
    return result[0]?.count ?? 0;
  }
}

export const messageRepository = new MessageRepository();

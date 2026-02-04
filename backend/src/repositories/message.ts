import { and, desc, eq, gt, lt, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { messages, type Message, type NewMessage } from '../db/schema';

export interface MessageQueryOptions {
  before?: Date;
  limit?: number;
}

export class MessageRepository {
  async findById(id: string): Promise<Message | null> {
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
      },
    });
    return result || null;
  }

  async findByChannelId(channelId: string, options?: MessageQueryOptions): Promise<Message[]> {
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

  async countUnread(channelId: string, lastReadAt: Date): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(messages)
      .where(and(eq(messages.channelId, channelId), gt(messages.createdAt, lastReadAt)));
    return result[0]?.count ?? 0;
  }
}

export const messageRepository = new MessageRepository();

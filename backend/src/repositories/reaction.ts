import { and, eq } from 'drizzle-orm';
import { db } from '../db/client';
import { messageReactions, type MessageReaction, type NewMessageReaction } from '../db/schema';

export class ReactionRepository {
  async add(data: NewMessageReaction): Promise<MessageReaction | null> {
    const [reaction] = await db
      .insert(messageReactions)
      .values(data)
      .onConflictDoNothing()
      .returning();
    return reaction || null;
  }

  async remove(messageId: string, userId: string, emoji: string): Promise<boolean> {
    const result = await db
      .delete(messageReactions)
      .where(and(
        eq(messageReactions.messageId, messageId),
        eq(messageReactions.userId, userId),
        eq(messageReactions.emoji, emoji)
      ))
      .returning();
    return result.length > 0;
  }
}

export const reactionRepository = new ReactionRepository();

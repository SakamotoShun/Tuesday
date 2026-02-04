import { and, eq } from 'drizzle-orm';
import { db } from '../db/client';
import { channelMembers, type ChannelMember, type NewChannelMember } from '../db/schema';

export class ChannelMemberRepository {
  async findByChannelId(channelId: string): Promise<ChannelMember[]> {
    return db.query.channelMembers.findMany({
      where: eq(channelMembers.channelId, channelId),
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
  }

  async findByUserId(userId: string): Promise<ChannelMember[]> {
    return db.query.channelMembers.findMany({
      where: eq(channelMembers.userId, userId),
    });
  }

  async findMembership(channelId: string, userId: string): Promise<ChannelMember | null> {
    const result = await db.query.channelMembers.findFirst({
      where: and(eq(channelMembers.channelId, channelId), eq(channelMembers.userId, userId)),
    });
    return result || null;
  }

  async join(channelId: string, userId: string): Promise<ChannelMember> {
    const [member] = await db
      .insert(channelMembers)
      .values({ channelId, userId })
      .returning();
    return member;
  }

  async leave(channelId: string, userId: string): Promise<boolean> {
    const result = await db
      .delete(channelMembers)
      .where(and(eq(channelMembers.channelId, channelId), eq(channelMembers.userId, userId)))
      .returning();
    return result.length > 0;
  }

  async updateLastRead(channelId: string, userId: string, lastReadAt: Date): Promise<ChannelMember | null> {
    const [member] = await db
      .update(channelMembers)
      .set({ lastReadAt })
      .where(and(eq(channelMembers.channelId, channelId), eq(channelMembers.userId, userId)))
      .returning();
    return member || null;
  }
}

export const channelMemberRepository = new ChannelMemberRepository();

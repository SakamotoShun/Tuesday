import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { channelMembers, type ChannelMember, type NewChannelMember } from '../db/schema';

export type ChannelMemberWithUser = ChannelMember & {
  user: { id: string; name: string; email: string; avatarUrl: string | null };
};

export class ChannelMemberRepository {
  private async getNextSortOrder(userId: string): Promise<number> {
    const [result] = await db
      .select({ maxSortOrder: sql<number>`COALESCE(MAX(${channelMembers.sortOrder}), -1000)` })
      .from(channelMembers)
      .where(eq(channelMembers.userId, userId));

    return Number(result?.maxSortOrder ?? -1000) + 1000;
  }

  async findByChannelId(channelId: string): Promise<ChannelMemberWithUser[]> {
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
    const sortOrder = await this.getNextSortOrder(userId);
    const [member] = await db
      .insert(channelMembers)
      .values({ channelId, userId, sortOrder })
      .returning();
    return member;
  }

  async joinWithRole(channelId: string, userId: string, role: 'owner' | 'member'): Promise<ChannelMember> {
    const sortOrder = await this.getNextSortOrder(userId);
    const [member] = await db
      .insert(channelMembers)
      .values({ channelId, userId, role, sortOrder })
      .returning();
    return member;
  }

  async addMembers(channelId: string, userIds: string[], role: 'owner' | 'member' = 'member'): Promise<void> {
    if (userIds.length === 0) return;
    const members = await Promise.all(
      userIds.map(async (userId) => ({
        channelId,
        userId,
        role,
        sortOrder: await this.getNextSortOrder(userId),
      }))
    );

    await db.insert(channelMembers).values(members);
  }

  async reorderForUser(userId: string, channelIds: string[]): Promise<void> {
    await db.transaction(async (tx) => {
      for (const [index, channelId] of channelIds.entries()) {
        await tx
          .update(channelMembers)
          .set({ sortOrder: index * 1000 })
          .where(and(eq(channelMembers.userId, userId), eq(channelMembers.channelId, channelId)));
      }
    });
  }

  async leave(channelId: string, userId: string): Promise<boolean> {
    const result = await db
      .delete(channelMembers)
      .where(and(eq(channelMembers.channelId, channelId), eq(channelMembers.userId, userId)))
      .returning();
    return result.length > 0;
  }

  async isOwner(channelId: string, userId: string): Promise<boolean> {
    const result = await db.query.channelMembers.findFirst({
      where: and(eq(channelMembers.channelId, channelId), eq(channelMembers.userId, userId)),
      columns: {
        role: true,
      },
    });
    return result?.role === 'owner';
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

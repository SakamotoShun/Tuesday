import { and, eq } from 'drizzle-orm';
import { db } from '../db/client';
import { botChannelMembers, channels, projects, type BotChannelMember } from '../db/schema';

export type BotChannelMemberWithChannel = BotChannelMember & {
  channel: typeof channels.$inferSelect & { project: typeof projects.$inferSelect | null };
};

export class BotChannelMemberRepository {
  async findByBotId(botId: string): Promise<BotChannelMemberWithChannel[]> {
    return db.query.botChannelMembers.findMany({
      where: eq(botChannelMembers.botId, botId),
      with: {
        channel: {
          with: {
            project: true,
          },
        },
      },
      orderBy: [botChannelMembers.addedAt],
    });
  }

  async findMembership(botId: string, channelId: string): Promise<BotChannelMember | null> {
    const result = await db.query.botChannelMembers.findFirst({
      where: and(eq(botChannelMembers.botId, botId), eq(botChannelMembers.channelId, channelId)),
    });
    return result || null;
  }

  async add(botId: string, channelId: string, addedBy: string): Promise<BotChannelMember> {
    const [member] = await db
      .insert(botChannelMembers)
      .values({ botId, channelId, addedBy })
      .returning();
    return member;
  }

  async remove(botId: string, channelId: string): Promise<boolean> {
    const result = await db
      .delete(botChannelMembers)
      .where(and(eq(botChannelMembers.botId, botId), eq(botChannelMembers.channelId, channelId)))
      .returning();
    return result.length > 0;
  }
}

export const botChannelMemberRepository = new BotChannelMemberRepository();

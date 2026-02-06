import { eq, desc } from 'drizzle-orm';
import { db } from '../db/client';
import { bots, botChannelMembers, type Bot, type NewBot } from '../db/schema';

export class BotRepository {
  async findAll(): Promise<Bot[]> {
    return db.query.bots.findMany({
      orderBy: [desc(bots.createdAt)],
    });
  }

  async findById(id: string): Promise<Bot | null> {
    const result = await db.query.bots.findFirst({
      where: eq(bots.id, id),
    });
    return result || null;
  }

  async findByToken(token: string): Promise<Bot | null> {
    const result = await db.query.bots.findFirst({
      where: eq(bots.webhookToken, token),
    });
    return result || null;
  }

  async findByChannelId(channelId: string): Promise<Bot[]> {
    const memberships = await db.query.botChannelMembers.findMany({
      where: eq(botChannelMembers.channelId, channelId),
      with: {
        bot: true,
      },
    });
    return memberships
      .map((membership) => membership.bot)
      .filter((bot): bot is Bot => bot !== null && bot !== undefined);
  }

  async create(data: NewBot): Promise<Bot> {
    const [bot] = await db.insert(bots).values(data).returning();
    return bot;
  }

  async update(id: string, data: Partial<NewBot>): Promise<Bot | null> {
    const [bot] = await db
      .update(bots)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(bots.id, id))
      .returning();
    return bot || null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await db.delete(bots).where(eq(bots.id, id)).returning();
    return result.length > 0;
  }
}

export const botRepository = new BotRepository();

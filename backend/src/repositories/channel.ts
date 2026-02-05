import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '../db/client';
import { channels, projectMembers, projects, type Channel, type NewChannel } from '../db/schema';

export type ChannelWithProject = Channel & {
  project: typeof projects.$inferSelect | null;
};

export class ChannelRepository {
  async findById(id: string): Promise<ChannelWithProject | null> {
    const result = await db.query.channels.findFirst({
      where: eq(channels.id, id),
      with: {
        project: true,
      },
    });
    return result || null;
  }

  async findByProjectId(projectId: string): Promise<ChannelWithProject[]> {
    return db.query.channels.findMany({
      where: and(
        eq(channels.projectId, projectId),
        eq(channels.type, 'project'),
        isNull(channels.archivedAt)
      ),
      with: {
        project: true,
      },
      orderBy: [desc(channels.createdAt)],
    });
  }

  async findWorkspaceChannels(): Promise<ChannelWithProject[]> {
    return db.query.channels.findMany({
      where: and(eq(channels.type, 'workspace'), isNull(channels.archivedAt)),
      with: {
        project: true,
      },
      orderBy: [desc(channels.createdAt)],
    });
  }

  async findAll(): Promise<ChannelWithProject[]> {
    return db.query.channels.findMany({
      where: isNull(channels.archivedAt),
      with: {
        project: true,
      },
      orderBy: [desc(channels.createdAt)],
    });
  }

  async findUserChannels(userId: string): Promise<ChannelWithProject[]> {
    return db.query.channels.findMany({
      where: (channels, { or, exists }) => and(
        isNull(channels.archivedAt),
        or(
          eq(channels.type, 'workspace'),
          exists(
            db
              .select()
              .from(projectMembers)
              .where(and(eq(projectMembers.projectId, channels.projectId), eq(projectMembers.userId, userId)))
          )
        )
      ),
      with: {
        project: true,
      },
      orderBy: [desc(channels.createdAt)],
    });
  }

  async create(data: NewChannel): Promise<Channel> {
    const [channel] = await db.insert(channels).values(data).returning();
    return channel;
  }

  async update(id: string, data: Partial<NewChannel>): Promise<Channel | null> {
    const [channel] = await db
      .update(channels)
      .set(data)
      .where(eq(channels.id, id))
      .returning();
    return channel || null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await db.delete(channels).where(eq(channels.id, id)).returning();
    return result.length > 0;
  }

  async archive(id: string): Promise<Channel | null> {
    const [channel] = await db
      .update(channels)
      .set({ archivedAt: new Date() })
      .where(eq(channels.id, id))
      .returning();
    return channel || null;
  }
}

export const channelRepository = new ChannelRepository();

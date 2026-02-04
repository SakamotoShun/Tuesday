import { eq, desc } from 'drizzle-orm';
import { db } from '../db/client';
import { whiteboards, type Whiteboard, type NewWhiteboard } from '../db/schema';

export class WhiteboardRepository {
  async findById(id: string): Promise<Whiteboard | null> {
    const result = await db.query.whiteboards.findFirst({
      where: eq(whiteboards.id, id),
      with: {
        project: true,
        createdBy: {
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

  async findByProjectId(projectId: string): Promise<Whiteboard[]> {
    return db.query.whiteboards.findMany({
      where: eq(whiteboards.projectId, projectId),
      with: {
        createdBy: {
          columns: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: [desc(whiteboards.updatedAt)],
    });
  }

  async create(data: NewWhiteboard): Promise<Whiteboard> {
    const [whiteboard] = await db.insert(whiteboards).values(data).returning();
    return whiteboard;
  }

  async update(id: string, data: Partial<NewWhiteboard>): Promise<Whiteboard | null> {
    const [whiteboard] = await db
      .update(whiteboards)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(whiteboards.id, id))
      .returning();
    return whiteboard || null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await db.delete(whiteboards).where(eq(whiteboards.id, id)).returning();
    return result.length > 0;
  }
}

export const whiteboardRepository = new WhiteboardRepository();

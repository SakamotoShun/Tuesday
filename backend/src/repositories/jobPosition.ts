import { eq, desc, ilike, or, and } from 'drizzle-orm';
import { db } from '../db/client';
import { jobPositions, type JobPosition, type NewJobPosition } from '../db/schema';

export class JobPositionRepository {
  async findAll(filters?: { status?: string; search?: string }): Promise<JobPosition[]> {
    const conditions = [];
    if (filters?.status) {
      conditions.push(eq(jobPositions.status, filters.status));
    }
    if (filters?.search) {
      conditions.push(
        or(
          ilike(jobPositions.title, `%${filters.search}%`),
          ilike(jobPositions.department, `%${filters.search}%`)
        )!
      );
    }

    return db.query.jobPositions.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      orderBy: [desc(jobPositions.createdAt)],
      with: {
        hiringManager: true,
        createdByUser: true,
      },
    });
  }

  async findById(id: string): Promise<JobPosition | null> {
    const result = await db.query.jobPositions.findFirst({
      where: eq(jobPositions.id, id),
      with: {
        hiringManager: true,
        createdByUser: true,
      },
    });
    return result || null;
  }

  async create(data: NewJobPosition): Promise<JobPosition> {
    const [position] = await db.insert(jobPositions).values(data).returning();
    return position;
  }

  async update(id: string, data: Partial<NewJobPosition>): Promise<JobPosition | null> {
    const [position] = await db
      .update(jobPositions)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(jobPositions.id, id))
      .returning();
    return position || null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await db.delete(jobPositions).where(eq(jobPositions.id, id)).returning();
    return result.length > 0;
  }
}

export const jobPositionRepository = new JobPositionRepository();

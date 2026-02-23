import { eq, desc } from 'drizzle-orm';
import { db } from '../db/client';
import { interviews, type Interview, type NewInterview } from '../db/schema';

export class InterviewRepository {
  async findByApplicationId(applicationId: string): Promise<Interview[]> {
    return db.query.interviews.findMany({
      where: eq(interviews.applicationId, applicationId),
      orderBy: [desc(interviews.scheduledAt)],
      with: {
        interviewer: true,
        createdByUser: true,
      },
    });
  }

  async findById(id: string): Promise<Interview | null> {
    const result = await db.query.interviews.findFirst({
      where: eq(interviews.id, id),
      with: {
        application: {
          with: {
            candidate: true,
            position: true,
          },
        },
        interviewer: true,
        createdByUser: true,
        notes: true,
      },
    });
    return result || null;
  }

  async create(data: NewInterview): Promise<Interview> {
    const [interview] = await db.insert(interviews).values(data).returning();
    return interview;
  }

  async update(id: string, data: Partial<NewInterview>): Promise<Interview | null> {
    const [interview] = await db
      .update(interviews)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(interviews.id, id))
      .returning();
    return interview || null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await db.delete(interviews).where(eq(interviews.id, id)).returning();
    return result.length > 0;
  }
}

export const interviewRepository = new InterviewRepository();

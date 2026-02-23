import { eq, asc } from 'drizzle-orm';
import { db } from '../db/client';
import { interviewStages, type InterviewStage, type NewInterviewStage } from '../db/schema';

export class InterviewStageRepository {
  async findAll(): Promise<InterviewStage[]> {
    return db.query.interviewStages.findMany({
      orderBy: [asc(interviewStages.sortOrder)],
    });
  }

  async findById(id: string): Promise<InterviewStage | null> {
    const result = await db.query.interviewStages.findFirst({
      where: eq(interviewStages.id, id),
    });
    return result || null;
  }

  async findDefault(): Promise<InterviewStage | null> {
    const result = await db.query.interviewStages.findFirst({
      where: eq(interviewStages.isDefault, true),
    });
    return result || null;
  }

  async create(data: NewInterviewStage): Promise<InterviewStage> {
    const [stage] = await db.insert(interviewStages).values(data).returning();
    return stage;
  }

  async update(id: string, data: Partial<NewInterviewStage>): Promise<InterviewStage | null> {
    const [stage] = await db
      .update(interviewStages)
      .set(data)
      .where(eq(interviewStages.id, id))
      .returning();
    return stage || null;
  }

  async delete(id: string): Promise<boolean> {
    const { jobApplications } = await import('../db/schema');
    const applicationsUsingStage = await db.query.jobApplications.findMany({
      where: eq(jobApplications.stageId, id),
    });

    if (applicationsUsingStage.length > 0) {
      throw new Error('Cannot delete stage that is in use by applications');
    }

    const result = await db.delete(interviewStages).where(eq(interviewStages.id, id)).returning();
    return result.length > 0;
  }

  async reorder(ids: string[]): Promise<void> {
    await db.transaction(async (tx) => {
      for (let i = 0; i < ids.length; i++) {
        await tx
          .update(interviewStages)
          .set({ sortOrder: i })
          .where(eq(interviewStages.id, ids[i]));
      }
    });
  }

  async setDefault(id: string): Promise<void> {
    await db.transaction(async (tx) => {
      await tx
        .update(interviewStages)
        .set({ isDefault: false })
        .where(eq(interviewStages.isDefault, true));
      await tx
        .update(interviewStages)
        .set({ isDefault: true })
        .where(eq(interviewStages.id, id));
    });
  }
}

export const interviewStageRepository = new InterviewStageRepository();

import { eq, asc } from 'drizzle-orm';
import { db } from '../db/client';
import { jobApplications, type JobApplication, type NewJobApplication } from '../db/schema';

export class JobApplicationRepository {
  async findByPositionId(positionId: string): Promise<JobApplication[]> {
    return db.query.jobApplications.findMany({
      where: eq(jobApplications.positionId, positionId),
      orderBy: [asc(jobApplications.sortOrder)],
      with: {
        candidate: true,
        stage: true,
        createdByUser: true,
        interviews: {
          with: {
            interviewer: true,
          },
        },
      },
    });
  }

  async findById(id: string): Promise<JobApplication | null> {
    const result = await db.query.jobApplications.findFirst({
      where: eq(jobApplications.id, id),
      with: {
        candidate: true,
        position: true,
        stage: true,
        createdByUser: true,
        interviews: {
          with: {
            interviewer: true,
          },
        },
        notes: {
          with: {
            createdByUser: true,
          },
        },
      },
    });
    return result || null;
  }

  async create(data: NewJobApplication): Promise<JobApplication> {
    const [application] = await db.insert(jobApplications).values(data).returning();
    return application;
  }

  async update(id: string, data: Partial<NewJobApplication>): Promise<JobApplication | null> {
    const [application] = await db
      .update(jobApplications)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(jobApplications.id, id))
      .returning();
    return application || null;
  }

  async updateStage(id: string, stageId: string): Promise<JobApplication | null> {
    const [application] = await db
      .update(jobApplications)
      .set({ stageId, updatedAt: new Date() })
      .where(eq(jobApplications.id, id))
      .returning();
    return application || null;
  }

  async updateSortOrder(id: string, sortOrder: number): Promise<JobApplication | null> {
    const [application] = await db
      .update(jobApplications)
      .set({ sortOrder, updatedAt: new Date() })
      .where(eq(jobApplications.id, id))
      .returning();
    return application || null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await db.delete(jobApplications).where(eq(jobApplications.id, id)).returning();
    return result.length > 0;
  }
}

export const jobApplicationRepository = new JobApplicationRepository();

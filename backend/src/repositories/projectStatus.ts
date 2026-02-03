import { eq, inArray, asc, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { projectStatuses, type ProjectStatus, type NewProjectStatus } from '../db/schema';

export class ProjectStatusRepository {
  async findAll(): Promise<ProjectStatus[]> {
    return db.query.projectStatuses.findMany({
      orderBy: [asc(projectStatuses.sortOrder)],
    });
  }

  async findById(id: string): Promise<ProjectStatus | null> {
    const result = await db.query.projectStatuses.findFirst({
      where: eq(projectStatuses.id, id),
    });
    return result || null;
  }

  async findDefault(): Promise<ProjectStatus | null> {
    const result = await db.query.projectStatuses.findFirst({
      where: eq(projectStatuses.isDefault, true),
    });
    return result || null;
  }

  async create(data: NewProjectStatus): Promise<ProjectStatus> {
    const [status] = await db.insert(projectStatuses).values(data).returning();
    return status;
  }

  async update(id: string, data: Partial<NewProjectStatus>): Promise<ProjectStatus | null> {
    const [status] = await db
      .update(projectStatuses)
      .set(data)
      .where(eq(projectStatuses.id, id))
      .returning();
    return status || null;
  }

  async delete(id: string): Promise<boolean> {
    // Check if any projects are using this status
    const { projects } = await import('../db/schema');
    const projectsUsingStatus = await db.query.projects.findMany({
      where: eq(projects.statusId, id),
    });

    if (projectsUsingStatus.length > 0) {
      throw new Error('Cannot delete status that is in use by projects');
    }

    const result = await db.delete(projectStatuses).where(eq(projectStatuses.id, id)).returning();
    return result.length > 0;
  }

  async reorder(ids: string[]): Promise<void> {
    await db.transaction(async (tx) => {
      for (let i = 0; i < ids.length; i++) {
        await tx
          .update(projectStatuses)
          .set({ sortOrder: i })
          .where(eq(projectStatuses.id, ids[i]));
      }
    });
  }

  async setDefault(id: string): Promise<void> {
    await db.transaction(async (tx) => {
      // Unset current default
      await tx
        .update(projectStatuses)
        .set({ isDefault: false })
        .where(eq(projectStatuses.isDefault, true));
      
      // Set new default
      await tx
        .update(projectStatuses)
        .set({ isDefault: true })
        .where(eq(projectStatuses.id, id));
    });
  }
}

export const projectStatusRepository = new ProjectStatusRepository();

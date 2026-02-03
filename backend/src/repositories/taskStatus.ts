import { eq, asc, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { taskStatuses, type TaskStatus, type NewTaskStatus } from '../db/schema';

export class TaskStatusRepository {
  async findAll(): Promise<TaskStatus[]> {
    return db.query.taskStatuses.findMany({
      orderBy: [asc(taskStatuses.sortOrder)],
    });
  }

  async findById(id: string): Promise<TaskStatus | null> {
    const result = await db.query.taskStatuses.findFirst({
      where: eq(taskStatuses.id, id),
    });
    return result || null;
  }

  async findDefault(): Promise<TaskStatus | null> {
    const result = await db.query.taskStatuses.findFirst({
      where: eq(taskStatuses.isDefault, true),
    });
    return result || null;
  }

  async create(data: NewTaskStatus): Promise<TaskStatus> {
    const [status] = await db.insert(taskStatuses).values(data).returning();
    return status;
  }

  async update(id: string, data: Partial<NewTaskStatus>): Promise<TaskStatus | null> {
    const [status] = await db
      .update(taskStatuses)
      .set(data)
      .where(eq(taskStatuses.id, id))
      .returning();
    return status || null;
  }

  async delete(id: string): Promise<boolean> {
    // Check if any tasks are using this status
    const { tasks } = await import('../db/schema');
    const tasksUsingStatus = await db.query.tasks.findMany({
      where: eq(tasks.statusId, id),
    });

    if (tasksUsingStatus.length > 0) {
      throw new Error('Cannot delete status that is in use by tasks');
    }

    const result = await db.delete(taskStatuses).where(eq(taskStatuses.id, id)).returning();
    return result.length > 0;
  }

  async reorder(ids: string[]): Promise<void> {
    await db.transaction(async (tx) => {
      for (let i = 0; i < ids.length; i++) {
        await tx
          .update(taskStatuses)
          .set({ sortOrder: i })
          .where(eq(taskStatuses.id, ids[i]));
      }
    });
  }

  async setDefault(id: string): Promise<void> {
    await db.transaction(async (tx) => {
      // Unset current default
      await tx
        .update(taskStatuses)
        .set({ isDefault: false })
        .where(eq(taskStatuses.isDefault, true));
      
      // Set new default
      await tx
        .update(taskStatuses)
        .set({ isDefault: true })
        .where(eq(taskStatuses.id, id));
    });
  }
}

export const taskStatusRepository = new TaskStatusRepository();

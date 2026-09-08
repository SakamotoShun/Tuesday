import { eq, and, inArray, asc, desc, sql } from 'drizzle-orm';
import { db, type DbExecutor } from '../db/client';
import { tasks, type Task, type NewTask } from '../db/schema';

export interface TaskFilters {
  statusId?: string;
  assigneeId?: string;
}

export class TaskRepository {
  async findById(id: string, executor: DbExecutor = db): Promise<Task | null> {
    const result = await executor.query.tasks.findFirst({
      where: eq(tasks.id, id),
      with: {
        status: true,
        createdBy: {
          columns: {
            id: true,
            name: true,
            email: true,
          },
        },
        assignees: {
          with: {
            user: {
              columns: {
                id: true,
                name: true,
                email: true,
                avatarUrl: true,
              },
            },
          },
        },
      },
    });
    return result || null;
  }

  async findByProjectId(projectId: string, filters?: TaskFilters): Promise<Task[]> {
    const conditions = [eq(tasks.projectId, projectId)];

    if (filters?.statusId) {
      conditions.push(eq(tasks.statusId, filters.statusId));
    }

    const result = await db.query.tasks.findMany({
      where: and(...conditions),
      with: {
        status: true,
        createdBy: {
          columns: {
            id: true,
            name: true,
            email: true,
          },
        },
        assignees: {
          with: {
            user: {
              columns: {
                id: true,
                name: true,
                email: true,
                avatarUrl: true,
              },
            },
          },
        },
      },
      orderBy: [asc(tasks.sortOrder), desc(tasks.createdAt)],
    });

    // Filter by assignee if specified
    if (filters?.assigneeId) {
      return result.filter(task => 
        task.assignees.some(a => a.userId === filters.assigneeId)
      );
    }

    return result;
  }

  async findByAssignee(userId: string): Promise<Task[]> {
    const result = await db.query.tasks.findMany({
      where: (tasks, { exists }) => exists(
        db.select().from(taskAssignees)
          .where(and(
            eq(taskAssignees.taskId, tasks.id),
            eq(taskAssignees.userId, userId)
          ))
      ),
      with: {
        status: true,
        project: true,
        createdBy: {
          columns: {
            id: true,
            name: true,
            email: true,
          },
        },
        assignees: {
          with: {
            user: {
              columns: {
                id: true,
                name: true,
                email: true,
                avatarUrl: true,
              },
            },
          },
        },
      },
      orderBy: [desc(tasks.updatedAt)],
    });

    return result;
  }

  async create(data: NewTask, executor: DbExecutor = db): Promise<Task> {
    const [task] = await executor.insert(tasks).values(data).returning();
    return task;
  }

  async update(id: string, data: Partial<NewTask>, executor: DbExecutor = db): Promise<Task | null> {
    const [task] = await executor
      .update(tasks)
      .set({ ...data, updatedAt: new Date(), version: sql`${tasks.version} + 1` })
      .where(eq(tasks.id, id))
      .returning();
    return task || null;
  }

  async updateIfVersion(
    id: string,
    expectedVersion: number,
    data: Partial<NewTask>,
    executor: DbExecutor = db,
  ): Promise<Task | null> {
    const [task] = await executor
      .update(tasks)
      .set({ ...data, updatedAt: new Date(), version: sql`${tasks.version} + 1` })
      .where(and(eq(tasks.id, id), eq(tasks.version, expectedVersion)))
      .returning();
    return task || null;
  }

  async updateStatus(id: string, statusId: string, executor: DbExecutor = db): Promise<Task | null> {
    return this.update(id, { statusId }, executor);
  }

  async updateSortOrder(id: string, sortOrder: number, executor: DbExecutor = db): Promise<Task | null> {
    return this.update(id, { sortOrder }, executor);
  }

  async delete(id: string): Promise<boolean> {
    const result = await db.delete(tasks).where(eq(tasks.id, id)).returning();
    return result.length > 0;
  }

  async findByIds(ids: string[]): Promise<Task[]> {
    if (ids.length === 0) return [];
    return db.query.tasks.findMany({
      where: inArray(tasks.id, ids),
      with: {
        status: true,
        createdBy: {
          columns: {
            id: true,
            name: true,
            email: true,
          },
        },
        assignees: {
          with: {
            user: {
              columns: {
                id: true,
                name: true,
                email: true,
                avatarUrl: true,
              },
            },
          },
        },
      },
    });
  }
}

export const taskRepository = new TaskRepository();

// Import here to avoid circular dependency
import { taskAssignees } from '../db/schema';

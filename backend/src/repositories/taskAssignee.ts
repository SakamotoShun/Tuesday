import { eq, and } from 'drizzle-orm';
import { db } from '../db/client';
import { taskAssignees, type TaskAssignee, type NewTaskAssignee } from '../db/schema';

export class TaskAssigneeRepository {
  async findByTaskId(taskId: string): Promise<(TaskAssignee & { user: { id: string; name: string; email: string; avatarUrl: string | null } })[]> {
    const result = await db.query.taskAssignees.findMany({
      where: eq(taskAssignees.taskId, taskId),
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
      orderBy: [taskAssignees.assignedAt],
    });
    return result as (TaskAssignee & { user: { id: string; name: string; email: string; avatarUrl: string | null } })[];
  }

  async addAssignee(taskId: string, userId: string): Promise<TaskAssignee> {
    const [assignee] = await db.insert(taskAssignees)
      .values({
        taskId,
        userId,
      })
      .returning();
    return assignee;
  }

  async removeAssignee(taskId: string, userId: string): Promise<boolean> {
    const result = await db
      .delete(taskAssignees)
      .where(and(
        eq(taskAssignees.taskId, taskId),
        eq(taskAssignees.userId, userId)
      ))
      .returning();
    return result.length > 0;
  }

  async setAssignees(taskId: string, userIds: string[]): Promise<void> {
    await db.transaction(async (tx) => {
      // Delete existing assignees
      await tx.delete(taskAssignees).where(eq(taskAssignees.taskId, taskId));
      
      // Insert new assignees
      if (userIds.length > 0) {
        await tx.insert(taskAssignees).values(
          userIds.map(userId => ({
            taskId,
            userId,
          }))
        );
      }
    });
  }

  async isAssignee(taskId: string, userId: string): Promise<boolean> {
    const result = await db.query.taskAssignees.findFirst({
      where: and(
        eq(taskAssignees.taskId, taskId),
        eq(taskAssignees.userId, userId)
      ),
    });
    return result !== null;
  }
}

export const taskAssigneeRepository = new TaskAssigneeRepository();

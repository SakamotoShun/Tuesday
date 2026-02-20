import { and, desc, eq, exists, isNull, or } from 'drizzle-orm';
import { db } from '../db/client';
import { activityLogs, projectMembers, type ActivityLog, type NewActivityLog } from '../db/schema';

export type ActivityLogWithRelations = ActivityLog & {
  actor: {
    id: string;
    name: string;
    email: string;
    avatarUrl: string | null;
  } | null;
  project: {
    id: string;
    name: string;
  } | null;
};

export class ActivityRepository {
  async create(data: NewActivityLog): Promise<ActivityLog> {
    const [created] = await db.insert(activityLogs).values(data).returning();
    return created;
  }

  async findRecentForUser(userId: string, isAdmin: boolean, limit = 25): Promise<ActivityLogWithRelations[]> {
    return db.query.activityLogs.findMany({
      where: isAdmin
        ? undefined
        : or(
            and(isNull(activityLogs.projectId), eq(activityLogs.actorId, userId)),
            exists(
              db
                .select()
                .from(projectMembers)
                .where(and(eq(projectMembers.projectId, activityLogs.projectId), eq(projectMembers.userId, userId)))
            )
          ),
      with: {
        actor: {
          columns: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
          },
        },
        project: {
          columns: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: [desc(activityLogs.createdAt)],
      limit,
    }) as Promise<ActivityLogWithRelations[]>;
  }

  async findByProject(projectId: string, limit = 25): Promise<ActivityLogWithRelations[]> {
    return db.query.activityLogs.findMany({
      where: eq(activityLogs.projectId, projectId),
      with: {
        actor: {
          columns: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
          },
        },
        project: {
          columns: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: [desc(activityLogs.createdAt)],
      limit,
    }) as Promise<ActivityLogWithRelations[]>;
  }
}

export const activityRepository = new ActivityRepository();

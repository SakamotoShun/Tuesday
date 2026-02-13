import { eq, and, gte, lte, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { timeEntries, type TimeEntry, type NewTimeEntry } from '../db/schema';

export class TimeEntryRepository {
  async findById(id: string): Promise<TimeEntry | null> {
    const result = await db.query.timeEntries.findFirst({
      where: eq(timeEntries.id, id),
      with: {
        project: {
          columns: {
            id: true,
            name: true,
          },
        },
        user: {
          columns: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
    return result || null;
  }

  async findByUserAndDateRange(
    userId: string,
    startDate: string,
    endDate: string
  ): Promise<TimeEntry[]> {
    return db.query.timeEntries.findMany({
      where: and(
        eq(timeEntries.userId, userId),
        gte(timeEntries.date, startDate),
        lte(timeEntries.date, endDate)
      ),
      with: {
        project: {
          columns: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: (timeEntries, { asc }) => [asc(timeEntries.date)],
    });
  }

  async findByProjectAndDateRange(
    projectId: string,
    startDate: string,
    endDate: string
  ): Promise<TimeEntry[]> {
    return db.query.timeEntries.findMany({
      where: and(
        eq(timeEntries.projectId, projectId),
        gte(timeEntries.date, startDate),
        lte(timeEntries.date, endDate)
      ),
      with: {
        user: {
          columns: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
            employmentType: true,
            hourlyRate: true,
          },
        },
      },
      orderBy: (timeEntries, { asc }) => [asc(timeEntries.date)],
    });
  }

  async findAllByDateRange(startDate: string, endDate: string): Promise<TimeEntry[]> {
    return db.query.timeEntries.findMany({
      where: and(
        gte(timeEntries.date, startDate),
        lte(timeEntries.date, endDate)
      ),
      with: {
        user: {
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
      orderBy: (timeEntries, { asc }) => [asc(timeEntries.date), asc(timeEntries.userId)],
    });
  }

  async findByUserProjectAndDate(
    userId: string,
    projectId: string,
    date: string
  ): Promise<TimeEntry | null> {
    const result = await db.query.timeEntries.findFirst({
      where: and(
        eq(timeEntries.userId, userId),
        eq(timeEntries.projectId, projectId),
        eq(timeEntries.date, date)
      ),
    });
    return result || null;
  }

  async upsert(data: NewTimeEntry): Promise<TimeEntry> {
    const existing = await this.findByUserProjectAndDate(
      data.userId,
      data.projectId,
      data.date as string
    );

    if (existing) {
      const [updated] = await db
        .update(timeEntries)
        .set({
          hours: data.hours,
          note: data.note,
          updatedAt: new Date(),
        })
        .where(eq(timeEntries.id, existing.id))
        .returning();
      return updated;
    }

    const [created] = await db.insert(timeEntries).values(data).returning();
    return created;
  }

  async delete(id: string): Promise<boolean> {
    const result = await db.delete(timeEntries).where(eq(timeEntries.id, id)).returning();
    return result.length > 0;
  }

  async getMonthlyOverview(
    userId: string,
    year: number,
    month: number
  ): Promise<Array<{ weekNumber: number; projectId: string; projectName: string; totalHours: string }>> {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);

    const result = await db
      .select({
        weekNumber: sql<number>`EXTRACT(WEEK FROM ${timeEntries.date})`,
        projectId: timeEntries.projectId,
        projectName: sql<string>`projects.name`,
        totalHours: sql<string>`SUM(${timeEntries.hours})`,
      })
      .from(timeEntries)
      .innerJoin(sql`projects`, sql`projects.id = ${timeEntries.projectId}`)
      .where(
        and(
          eq(timeEntries.userId, userId),
          gte(timeEntries.date, startDate.toISOString().split('T')[0]),
          lte(timeEntries.date, endDate.toISOString().split('T')[0])
        )
      )
      .groupBy(sql`EXTRACT(WEEK FROM ${timeEntries.date})`, timeEntries.projectId, sql`projects.name`);

    return result as Array<{ weekNumber: number; projectId: string; projectName: string; totalHours: string }>;
  }

  async getProjectMonthlyOverview(
    projectId: string,
    year: number,
    month: number
  ): Promise<Array<{ weekNumber: number; userId: string; userName: string; totalHours: string }>> {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);

    const result = await db
      .select({
        weekNumber: sql<number>`EXTRACT(WEEK FROM ${timeEntries.date})`,
        userId: timeEntries.userId,
        userName: sql<string>`users.name`,
        totalHours: sql<string>`SUM(${timeEntries.hours})`,
      })
      .from(timeEntries)
      .innerJoin(sql`users`, sql`users.id = ${timeEntries.userId}`)
      .where(
        and(
          eq(timeEntries.projectId, projectId),
          gte(timeEntries.date, startDate.toISOString().split('T')[0]),
          lte(timeEntries.date, endDate.toISOString().split('T')[0])
        )
      )
      .groupBy(sql`EXTRACT(WEEK FROM ${timeEntries.date})`, timeEntries.userId, sql`users.name`);

    return result as Array<{ weekNumber: number; userId: string; userName: string; totalHours: string }>;
  }

  async getWorkspaceMonthlyOverview(
    year: number,
    month: number
  ): Promise<Array<{ weekNumber: number; userId: string; userName: string; totalHours: string }>> {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);

    const result = await db
      .select({
        weekNumber: sql<number>`EXTRACT(WEEK FROM ${timeEntries.date})`,
        userId: timeEntries.userId,
        userName: sql<string>`users.name`,
        totalHours: sql<string>`SUM(${timeEntries.hours})`,
      })
      .from(timeEntries)
      .innerJoin(sql`users`, sql`users.id = ${timeEntries.userId}`)
      .where(
        and(
          gte(timeEntries.date, startDate.toISOString().split('T')[0]),
          lte(timeEntries.date, endDate.toISOString().split('T')[0])
        )
      )
      .groupBy(sql`EXTRACT(WEEK FROM ${timeEntries.date})`, timeEntries.userId, sql`users.name`);

    return result as Array<{ weekNumber: number; userId: string; userName: string; totalHours: string }>;
  }
}

export const timeEntryRepository = new TimeEntryRepository();

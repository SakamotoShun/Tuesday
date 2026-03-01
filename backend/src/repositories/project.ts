import { eq, inArray, and, sql, desc, isNotNull } from 'drizzle-orm';
import { db } from '../db/client';
import {
  projects,
  projectMembers,
  projectStatuses,
  users,
  timeEntries,
  type Project,
  type NewProject,
  type ProjectMember,
} from '../db/schema';

// Type for project with relations
export type ProjectWithRelations = Project & {
  status: typeof projectStatuses.$inferSelect | null;
  owner: typeof users.$inferSelect | null;
  members?: ProjectMember[];
  totalLoggedHours?: number;
};

export class ProjectRepository {
  private async getTotalLoggedHoursByProjectIds(projectIds: string[]): Promise<Map<string, number>> {
    if (projectIds.length === 0) {
      return new Map();
    }

    const rows = await db
      .select({
        projectId: timeEntries.projectId,
        totalHours: sql<string>`COALESCE(SUM(${timeEntries.hours}), 0)`,
      })
      .from(timeEntries)
      .where(and(isNotNull(timeEntries.projectId), inArray(timeEntries.projectId, projectIds)))
      .groupBy(timeEntries.projectId);

    const totals = new Map<string, number>();

    for (const row of rows) {
      if (!row.projectId) continue;
      const parsed = Number(row.totalHours);
      totals.set(row.projectId, Number.isFinite(parsed) ? parsed : 0);
    }

    for (const projectId of projectIds) {
      if (!totals.has(projectId)) {
        totals.set(projectId, 0);
      }
    }

    return totals;
  }

  private async attachTotalLoggedHours<T extends { id: string }>(
    projectRows: T[]
  ): Promise<Array<T & { totalLoggedHours: number }>> {
    if (projectRows.length === 0) {
      return [];
    }

    const totals = await this.getTotalLoggedHoursByProjectIds(projectRows.map((project) => project.id));

    return projectRows.map((project) => ({
      ...project,
      totalLoggedHours: totals.get(project.id) ?? 0,
    }));
  }

  async findById(id: string): Promise<ProjectWithRelations | null> {
    const result = await db.query.projects.findFirst({
      where: eq(projects.id, id),
      with: {
        status: true,
        owner: true,
      },
    });

    if (!result) {
      return null;
    }

    const [projectWithTotals] = await this.attachTotalLoggedHours([result]);
    return projectWithTotals || null;
  }

  async findByUserId(userId: string): Promise<ProjectWithRelations[]> {
    const result = await db.query.projects.findMany({
      where: (projects, { exists, and: andOp, eq: eqOp }) => andOp(
        eqOp(projects.isTemplate, false),
        exists(
          db.select().from(projectMembers)
            .where(and(
              eq(projectMembers.projectId, projects.id),
              eq(projectMembers.userId, userId)
            ))
        )
      ),
      with: {
        status: true,
        owner: true,
        members: true,
      },
      orderBy: [desc(projects.updatedAt)],
    });

    return this.attachTotalLoggedHours(result);
  }

  async findAll(): Promise<ProjectWithRelations[]> {
    const result = await db.query.projects.findMany({
      where: eq(projects.isTemplate, false),
      with: {
        status: true,
        owner: true,
        members: true,
      },
      orderBy: [desc(projects.updatedAt)],
    });

    return this.attachTotalLoggedHours(result);
  }

  async findAllIncludingTemplates(): Promise<ProjectWithRelations[]> {
    return db.query.projects.findMany({
      with: {
        status: true,
        owner: true,
      },
      orderBy: [desc(projects.updatedAt)],
    });
  }

  async findTemplates(): Promise<ProjectWithRelations[]> {
    return db.query.projects.findMany({
      where: eq(projects.isTemplate, true),
      with: {
        status: true,
        owner: true,
      },
      orderBy: [desc(projects.updatedAt)],
    });
  }

  async setTemplate(id: string, isTemplate: boolean): Promise<Project | null> {
    const [project] = await db
      .update(projects)
      .set({ isTemplate, updatedAt: new Date() })
      .where(eq(projects.id, id))
      .returning();
    return project || null;
  }

  async create(data: NewProject): Promise<Project> {
    const [project] = await db.insert(projects).values(data).returning();
    return project;
  }

  async update(id: string, data: Partial<NewProject>): Promise<Project | null> {
    const [project] = await db
      .update(projects)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(projects.id, id))
      .returning();
    return project || null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await db.delete(projects).where(eq(projects.id, id)).returning();
    return result.length > 0;
  }

  async findByIds(ids: string[]): Promise<ProjectWithRelations[]> {
    if (ids.length === 0) return [];
    return db.query.projects.findMany({
      where: inArray(projects.id, ids),
      with: {
        status: true,
        owner: true,
      },
    });
  }
}

export const projectRepository = new ProjectRepository();

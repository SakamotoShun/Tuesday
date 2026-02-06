import { eq, inArray, and, sql, desc } from 'drizzle-orm';
import { db } from '../db/client';
import { projects, projectMembers, projectStatuses, users, type Project, type NewProject } from '../db/schema';

// Type for project with relations
export type ProjectWithRelations = Project & {
  status: typeof projectStatuses.$inferSelect | null;
  owner: typeof users.$inferSelect | null;
};

export class ProjectRepository {
  async findById(id: string): Promise<ProjectWithRelations | null> {
    const result = await db.query.projects.findFirst({
      where: eq(projects.id, id),
      with: {
        status: true,
        owner: true,
      },
    });
    return result || null;
  }

  async findByUserId(userId: string): Promise<ProjectWithRelations[]> {
    return db.query.projects.findMany({
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
      },
      orderBy: [desc(projects.updatedAt)],
    });
  }

  async findAll(): Promise<ProjectWithRelations[]> {
    return db.query.projects.findMany({
      where: eq(projects.isTemplate, false),
      with: {
        status: true,
        owner: true,
      },
      orderBy: [desc(projects.updatedAt)],
    });
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

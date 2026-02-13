import { and, desc, eq, exists, ilike, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { docs, projectMembers, projects, tasks, UserRole } from '../db/schema';

export interface SearchProjectResult {
  id: string;
  name: string;
  client: string | null;
  updatedAt: Date;
}

export interface SearchDocRecord {
  id: string;
  title: string;
  projectId: string | null;
  projectName: string | null;
  isPersonal: boolean;
  searchText: string;
  updatedAt: Date;
}

export interface SearchTaskRecord {
  id: string;
  title: string;
  projectId: string;
  projectName: string;
  descriptionMd: string | null;
  updatedAt: Date;
}

export class SearchRepository {
  async searchProjects(userId: string, role: string, query: string, limit: number): Promise<SearchProjectResult[]> {
    const pattern = `%${query}%`;
    const prefixPattern = `${query}%`;
    const rank = sql<number>`
      CASE
        WHEN lower(${projects.name}) = lower(${query}) THEN 0
        WHEN ${projects.name} ILIKE ${prefixPattern} THEN 1
        ELSE 2
      END
    `;

    if (role === UserRole.ADMIN) {
      return db
        .select({
          id: projects.id,
          name: projects.name,
          client: projects.client,
          updatedAt: projects.updatedAt,
        })
        .from(projects)
        .where(and(eq(projects.isTemplate, false), ilike(projects.name, pattern)))
        .orderBy(rank, desc(projects.updatedAt))
        .limit(limit);
    }

    return db
      .select({
        id: projects.id,
        name: projects.name,
        client: projects.client,
        updatedAt: projects.updatedAt,
      })
      .from(projects)
      .where(
        and(
          eq(projects.isTemplate, false),
          ilike(projects.name, pattern),
          exists(
            db
              .select({ projectId: projectMembers.projectId })
              .from(projectMembers)
              .where(and(eq(projectMembers.projectId, projects.id), eq(projectMembers.userId, userId)))
          )
        )
      )
      .orderBy(rank, desc(projects.updatedAt))
      .limit(limit);
  }

  async searchDocs(userId: string, role: string, query: string, limit: number): Promise<SearchDocRecord[]> {
    const pattern = `%${query}%`;
    const prefixPattern = `${query}%`;
    const matchCondition = or(ilike(docs.title, pattern), ilike(docs.searchText, pattern));
    const rank = sql<number>`
      CASE
        WHEN lower(${docs.title}) = lower(${query}) THEN 0
        WHEN ${docs.title} ILIKE ${prefixPattern} THEN 1
        WHEN ${docs.title} ILIKE ${pattern} THEN 2
        WHEN ${docs.searchText} ILIKE ${pattern} THEN 3
        ELSE 4
      END
    `;

    if (role === UserRole.ADMIN) {
      return db
        .select({
          id: docs.id,
          title: docs.title,
          projectId: docs.projectId,
          projectName: projects.name,
          isPersonal: sql<boolean>`${docs.projectId} is null`,
          searchText: docs.searchText,
          updatedAt: docs.updatedAt,
        })
        .from(docs)
        .leftJoin(projects, eq(docs.projectId, projects.id))
        .where(and(matchCondition, or(isNull(docs.projectId), eq(projects.isTemplate, false))))
        .orderBy(rank, desc(docs.updatedAt))
        .limit(limit);
    }

    return db
      .select({
        id: docs.id,
        title: docs.title,
        projectId: docs.projectId,
        projectName: projects.name,
        isPersonal: sql<boolean>`${docs.projectId} is null`,
        searchText: docs.searchText,
        updatedAt: docs.updatedAt,
      })
      .from(docs)
      .leftJoin(projects, eq(docs.projectId, projects.id))
      .where(
        and(
          matchCondition,
          or(
            and(isNull(docs.projectId), eq(docs.createdBy, userId)),
            and(
              isNotNull(docs.projectId),
              eq(projects.isTemplate, false),
              exists(
                db
                  .select({ projectId: projectMembers.projectId })
                  .from(projectMembers)
                  .where(and(eq(projectMembers.projectId, docs.projectId), eq(projectMembers.userId, userId)))
              )
            )
          )
        )
      )
      .orderBy(rank, desc(docs.updatedAt))
      .limit(limit);
  }

  async searchTasks(userId: string, role: string, query: string, limit: number): Promise<SearchTaskRecord[]> {
    const pattern = `%${query}%`;
    const prefixPattern = `${query}%`;
    const matchCondition = or(ilike(tasks.title, pattern), ilike(tasks.descriptionMd, pattern));
    const rank = sql<number>`
      CASE
        WHEN lower(${tasks.title}) = lower(${query}) THEN 0
        WHEN ${tasks.title} ILIKE ${prefixPattern} THEN 1
        WHEN ${tasks.title} ILIKE ${pattern} THEN 2
        WHEN ${tasks.descriptionMd} ILIKE ${pattern} THEN 3
        ELSE 4
      END
    `;

    if (role === UserRole.ADMIN) {
      return db
        .select({
          id: tasks.id,
          title: tasks.title,
          projectId: tasks.projectId,
          projectName: projects.name,
          descriptionMd: tasks.descriptionMd,
          updatedAt: tasks.updatedAt,
        })
        .from(tasks)
        .innerJoin(projects, eq(tasks.projectId, projects.id))
        .where(and(eq(projects.isTemplate, false), matchCondition))
        .orderBy(rank, desc(tasks.updatedAt))
        .limit(limit);
    }

    return db
      .select({
        id: tasks.id,
        title: tasks.title,
        projectId: tasks.projectId,
        projectName: projects.name,
        descriptionMd: tasks.descriptionMd,
        updatedAt: tasks.updatedAt,
      })
      .from(tasks)
      .innerJoin(projects, eq(tasks.projectId, projects.id))
      .where(
        and(
          eq(projects.isTemplate, false),
          matchCondition,
          exists(
            db
              .select({ projectId: projectMembers.projectId })
              .from(projectMembers)
              .where(and(eq(projectMembers.projectId, tasks.projectId), eq(projectMembers.userId, userId)))
          )
        )
      )
      .orderBy(rank, desc(tasks.updatedAt))
      .limit(limit);
  }
}

export const searchRepository = new SearchRepository();

import { eq, and, inArray } from 'drizzle-orm';
import { db, type DbExecutor } from '../db/client';
import { projectMembers, users, type ProjectMember, type NewProjectMember, ProjectMemberRole, ProjectMemberSource } from '../db/schema';

export class ProjectMemberRepository {
  async findByProjectId(projectId: string): Promise<(ProjectMember & { user: { id: string; name: string; email: string; avatarUrl: string | null; role: string } })[]> {
    const result = await db.query.projectMembers.findMany({
      where: eq(projectMembers.projectId, projectId),
      with: {
        user: {
          columns: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
            role: true,
          },
        },
        sourceTeam: {
          columns: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: [projectMembers.joinedAt],
    });
    return result as (ProjectMember & { user: { id: string; name: string; email: string; avatarUrl: string | null; role: string }; sourceTeam?: { id: string; name: string } | null })[];
  }

  async findActiveByProjectId(projectId: string) {
    const result = await db.query.projectMembers.findMany({
      where: eq(projectMembers.projectId, projectId),
      with: {
        user: {
          columns: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
            role: true,
            isDisabled: true,
          },
        },
      },
      orderBy: [projectMembers.joinedAt],
    });
    return result.filter((member) => !member.user.isDisabled);
  }

  async findActiveMemberIds(projectId: string, userIds: string[], executor: DbExecutor = db): Promise<string[]> {
    if (userIds.length === 0) return [];
    const rows = await executor
      .select({ userId: projectMembers.userId })
      .from(projectMembers)
      .innerJoin(users, eq(users.id, projectMembers.userId))
      .where(and(
        eq(projectMembers.projectId, projectId),
        inArray(projectMembers.userId, userIds),
        eq(users.isDisabled, false),
      ));
    return rows.map((row) => row.userId);
  }

  async findByUserId(userId: string): Promise<ProjectMember[]> {
    return db.query.projectMembers.findMany({
      where: eq(projectMembers.userId, userId),
      with: {
        project: true,
      },
    });
  }

  async findMembership(projectId: string, userId: string, executor: DbExecutor = db): Promise<ProjectMember | null> {
    const result = await executor.query.projectMembers.findFirst({
      where: and(
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.userId, userId)
      ),
    });
    return result || null;
  }

  async addMember(
    projectId: string,
    userId: string,
    role: string = ProjectMemberRole.MEMBER,
    source: string = ProjectMemberSource.DIRECT,
    sourceTeamId: string | null = null,
    executor: DbExecutor = db,
  ): Promise<ProjectMember> {
    const [member] = await executor.insert(projectMembers)
      .values({
        projectId,
        userId,
        role,
        source,
        sourceTeamId,
      })
      .returning();
    return member;
  }

  async updateRole(projectId: string, userId: string, role: string): Promise<ProjectMember | null> {
    const [member] = await db
      .update(projectMembers)
      .set({ role })
      .where(and(
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.userId, userId)
      ))
      .returning();
    return member || null;
  }

  async updateMembership(projectId: string, userId: string, data: Partial<Pick<NewProjectMember, 'role' | 'source' | 'sourceTeamId'>>, executor: DbExecutor = db): Promise<ProjectMember | null> {
    const [member] = await executor
      .update(projectMembers)
      .set(data)
      .where(and(
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.userId, userId)
      ))
      .returning();
    return member || null;
  }

  async removeMember(projectId: string, userId: string): Promise<boolean> {
    const result = await db
      .delete(projectMembers)
      .where(and(
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.userId, userId)
      ))
      .returning();
    return result.length > 0;
  }

  async isMember(projectId: string, userId: string): Promise<boolean> {
    const membership = await this.findMembership(projectId, userId);
    return membership !== null;
  }

  async isOwner(projectId: string, userId: string): Promise<boolean> {
    const membership = await this.findMembership(projectId, userId);
    return membership?.role === ProjectMemberRole.OWNER;
  }
}

export const projectMemberRepository = new ProjectMemberRepository();

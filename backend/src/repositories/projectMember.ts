import { eq, and } from 'drizzle-orm';
import { db } from '../db/client';
import { projectMembers, type ProjectMember, type NewProjectMember, ProjectMemberRole } from '../db/schema';

export class ProjectMemberRepository {
  async findByProjectId(projectId: string): Promise<(ProjectMember & { user: { id: string; name: string; email: string; avatarUrl: string | null } })[]> {
    const result = await db.query.projectMembers.findMany({
      where: eq(projectMembers.projectId, projectId),
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
      orderBy: [projectMembers.joinedAt],
    });
    return result as (ProjectMember & { user: { id: string; name: string; email: string; avatarUrl: string | null } })[];
  }

  async findByUserId(userId: string): Promise<ProjectMember[]> {
    return db.query.projectMembers.findMany({
      where: eq(projectMembers.userId, userId),
      with: {
        project: true,
      },
    });
  }

  async findMembership(projectId: string, userId: string): Promise<ProjectMember | null> {
    const result = await db.query.projectMembers.findFirst({
      where: and(
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.userId, userId)
      ),
    });
    return result || null;
  }

  async addMember(projectId: string, userId: string, role: string = ProjectMemberRole.MEMBER): Promise<ProjectMember> {
    const [member] = await db.insert(projectMembers)
      .values({
        projectId,
        userId,
        role,
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

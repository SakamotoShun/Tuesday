import { and, eq } from 'drizzle-orm';
import { db } from '../db/client';
import { teamMembers, TeamMemberRole, type TeamMember } from '../db/schema';

export class TeamMemberRepository {
  async findByTeamId(teamId: string): Promise<(TeamMember & { user: { id: string; name: string; email: string; avatarUrl: string | null } })[]> {
    const result = await db.query.teamMembers.findMany({
      where: eq(teamMembers.teamId, teamId),
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
      orderBy: [teamMembers.joinedAt],
    });
    return result as (TeamMember & { user: { id: string; name: string; email: string; avatarUrl: string | null } })[];
  }

  async findMembership(teamId: string, userId: string): Promise<TeamMember | null> {
    const result = await db.query.teamMembers.findFirst({
      where: and(
        eq(teamMembers.teamId, teamId),
        eq(teamMembers.userId, userId)
      ),
    });
    return result || null;
  }

  async addMember(teamId: string, userId: string, role: string = TeamMemberRole.MEMBER): Promise<TeamMember> {
    const [member] = await db.insert(teamMembers)
      .values({ teamId, userId, role })
      .returning();
    return member;
  }

  async updateRole(teamId: string, userId: string, role: string): Promise<TeamMember | null> {
    const [member] = await db
      .update(teamMembers)
      .set({ role })
      .where(and(
        eq(teamMembers.teamId, teamId),
        eq(teamMembers.userId, userId)
      ))
      .returning();
    return member || null;
  }

  async removeMember(teamId: string, userId: string): Promise<boolean> {
    const result = await db
      .delete(teamMembers)
      .where(and(
        eq(teamMembers.teamId, teamId),
        eq(teamMembers.userId, userId)
      ))
      .returning();
    return result.length > 0;
  }

  async isMember(teamId: string, userId: string): Promise<boolean> {
    const membership = await this.findMembership(teamId, userId);
    return membership !== null;
  }

  async isLead(teamId: string, userId: string): Promise<boolean> {
    const membership = await this.findMembership(teamId, userId);
    return membership?.role === TeamMemberRole.LEAD;
  }
}

export const teamMemberRepository = new TeamMemberRepository();

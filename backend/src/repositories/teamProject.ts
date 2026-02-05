import { and, eq, ne } from 'drizzle-orm';
import { db } from '../db/client';
import { teamProjects, teamMembers, type TeamProject, type Team } from '../db/schema';

export class TeamProjectRepository {
  async findByTeamId(teamId: string): Promise<(TeamProject & { project: { id: string; name: string } })[]> {
    const result = await db.query.teamProjects.findMany({
      where: eq(teamProjects.teamId, teamId),
      with: {
        project: {
          columns: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: [teamProjects.assignedAt],
    });
    return result as (TeamProject & { project: { id: string; name: string } })[];
  }

  async findTeamsByProjectId(projectId: string): Promise<Team[]> {
    const result = await db.query.teamProjects.findMany({
      where: eq(teamProjects.projectId, projectId),
      with: {
        team: true,
      },
      orderBy: [teamProjects.assignedAt],
    });

    return result.map((row) => row.team) as Team[];
  }

  async findMembership(teamId: string, projectId: string): Promise<TeamProject | null> {
    const result = await db.query.teamProjects.findFirst({
      where: and(
        eq(teamProjects.teamId, teamId),
        eq(teamProjects.projectId, projectId)
      ),
    });
    return result || null;
  }

  async addProject(teamId: string, projectId: string): Promise<TeamProject> {
    const [teamProject] = await db.insert(teamProjects)
      .values({ teamId, projectId })
      .returning();
    return teamProject;
  }

  async removeProject(teamId: string, projectId: string): Promise<boolean> {
    const result = await db
      .delete(teamProjects)
      .where(and(
        eq(teamProjects.teamId, teamId),
        eq(teamProjects.projectId, projectId)
      ))
      .returning();
    return result.length > 0;
  }

  async findProjectIdsByTeamId(teamId: string): Promise<string[]> {
    const result = await db.query.teamProjects.findMany({
      where: eq(teamProjects.teamId, teamId),
      columns: {
        projectId: true,
      },
    });
    return result.map((row) => row.projectId);
  }

  async findTeamIdsForUserProject(userId: string, projectId: string, excludeTeamId?: string): Promise<string[]> {
    const conditions = [
      eq(teamProjects.projectId, projectId),
      eq(teamMembers.userId, userId),
    ];
    if (excludeTeamId) {
      conditions.push(ne(teamProjects.teamId, excludeTeamId));
    }

    const result = await db
      .select({ teamId: teamProjects.teamId })
      .from(teamProjects)
      .innerJoin(teamMembers, eq(teamMembers.teamId, teamProjects.teamId))
      .where(and(...conditions));

    return result.map((row) => row.teamId);
  }
}

export const teamProjectRepository = new TeamProjectRepository();

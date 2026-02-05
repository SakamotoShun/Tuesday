import { projectRepository, projectMemberRepository, teamRepository, teamMemberRepository, teamProjectRepository } from '../repositories';
import { ProjectMemberRole, ProjectMemberSource, TeamMemberRole, UserRole } from '../db/schema';
import type { Team, TeamMember, TeamProject } from '../db/schema';
import type { User } from '../types';
import { projectService } from './project';

export interface CreateTeamInput {
  name: string;
  description?: string | null;
}

export interface UpdateTeamInput {
  name?: string;
  description?: string | null;
}

export interface TeamSummary extends Team {
  memberCount: number;
  projectCount: number;
}

export class TeamService {
  async listTeams(user: User): Promise<TeamSummary[]> {
    const teams = user.role === UserRole.ADMIN
      ? await teamRepository.findAll()
      : await teamRepository.findByUserId(user.id);

    return Promise.all(teams.map(async (team) => this.buildSummary(team)));
  }

  async getTeam(teamId: string, user: User): Promise<TeamSummary | null> {
    const team = await teamRepository.findById(teamId);
    if (!team) {
      return null;
    }

    if (user.role !== UserRole.ADMIN) {
      const isMember = await teamMemberRepository.isMember(teamId, user.id);
      if (!isMember) {
        return null;
      }
    }

    return this.buildSummary(team);
  }

  async createTeam(input: CreateTeamInput, user: User): Promise<Team> {
    if (user.role !== UserRole.ADMIN) {
      throw new Error('Only admins can create teams');
    }

    if (!input.name || input.name.trim() === '') {
      throw new Error('Team name is required');
    }

    return teamRepository.create({
      name: input.name.trim(),
      description: input.description?.trim() || null,
    });
  }

  async updateTeam(teamId: string, input: UpdateTeamInput, user: User): Promise<Team | null> {
    const team = await teamRepository.findById(teamId);
    if (!team) {
      return null;
    }

    const canManage = user.role === UserRole.ADMIN || await teamMemberRepository.isLead(teamId, user.id);
    if (!canManage) {
      throw new Error('Only team leads can update this team');
    }

    const updateData: Partial<Team> = {};

    if (input.name !== undefined) {
      if (input.name.trim() === '') {
        throw new Error('Team name cannot be empty');
      }
      updateData.name = input.name.trim();
    }

    if (input.description !== undefined) {
      updateData.description = input.description?.trim() || null;
    }

    return teamRepository.update(teamId, updateData);
  }

  async deleteTeam(teamId: string, user: User): Promise<boolean> {
    if (user.role !== UserRole.ADMIN) {
      throw new Error('Only admins can delete teams');
    }

    const team = await teamRepository.findById(teamId);
    if (!team) {
      return false;
    }

    const members = await teamMemberRepository.findByTeamId(teamId);
    const projectIds = await teamProjectRepository.findProjectIdsByTeamId(teamId);

    for (const projectId of projectIds) {
      for (const member of members) {
        await this.removeTeamAccessFromProject(projectId, member.userId, teamId);
      }
    }

    return teamRepository.delete(teamId);
  }

  async getMembers(teamId: string, user: User): Promise<(TeamMember & { user: { id: string; name: string; email: string; avatarUrl: string | null } })[]> {
    const hasAccess = await this.hasAccess(teamId, user);
    if (!hasAccess) {
      throw new Error('Access denied');
    }
    return teamMemberRepository.findByTeamId(teamId);
  }

  async addMember(teamId: string, userId: string, role: string, currentUser: User): Promise<TeamMember> {
    const canManage = await this.isLead(teamId, currentUser);
    if (!canManage) {
      throw new Error('Only team leads can add members');
    }

    const existing = await teamMemberRepository.findMembership(teamId, userId);
    if (existing) {
      throw new Error('User is already a member of this team');
    }

    if (role !== TeamMemberRole.LEAD && role !== TeamMemberRole.MEMBER) {
      throw new Error('Invalid role');
    }

    const member = await teamMemberRepository.addMember(teamId, userId, role);

    const projectIds = await teamProjectRepository.findProjectIdsByTeamId(teamId);
    for (const projectId of projectIds) {
      await this.ensureTeamProjectMember(projectId, userId, teamId);
    }

    return member;
  }

  async updateMemberRole(teamId: string, userId: string, role: string, currentUser: User): Promise<TeamMember | null> {
    const canManage = await this.isLead(teamId, currentUser);
    if (!canManage) {
      throw new Error('Only team leads can update member roles');
    }

    if (role !== TeamMemberRole.LEAD && role !== TeamMemberRole.MEMBER) {
      throw new Error('Invalid role');
    }

    const membership = await teamMemberRepository.findMembership(teamId, userId);
    if (!membership) {
      return null;
    }

    if (membership.role === TeamMemberRole.LEAD && role !== TeamMemberRole.LEAD) {
      const members = await teamMemberRepository.findByTeamId(teamId);
      const leads = members.filter((member) => member.role === TeamMemberRole.LEAD);
      if (leads.length === 1 && leads[0].userId === userId) {
        throw new Error('Cannot remove the only team lead');
      }
    }

    return teamMemberRepository.updateRole(teamId, userId, role);
  }

  async removeMember(teamId: string, userId: string, currentUser: User): Promise<boolean> {
    const canManage = await this.isLead(teamId, currentUser);
    if (!canManage) {
      throw new Error('Only team leads can remove members');
    }

    const membership = await teamMemberRepository.findMembership(teamId, userId);
    if (!membership) {
      return false;
    }

    if (membership.role === TeamMemberRole.LEAD) {
      const members = await teamMemberRepository.findByTeamId(teamId);
      const leads = members.filter((member) => member.role === TeamMemberRole.LEAD);
      if (leads.length === 1 && leads[0].userId === userId) {
        throw new Error('Cannot remove the only team lead');
      }
    }

    const removed = await teamMemberRepository.removeMember(teamId, userId);
    if (!removed) {
      return false;
    }

    const projectIds = await teamProjectRepository.findProjectIdsByTeamId(teamId);
    for (const projectId of projectIds) {
      await this.removeTeamAccessFromProject(projectId, userId, teamId);
    }

    return true;
  }

  async getProjects(teamId: string, user: User): Promise<(TeamProject & { project: { id: string; name: string } })[]> {
    const hasAccess = await this.hasAccess(teamId, user);
    if (!hasAccess) {
      throw new Error('Access denied');
    }
    return teamProjectRepository.findByTeamId(teamId);
  }

  async assignProject(teamId: string, projectId: string, currentUser: User): Promise<TeamProject> {
    const canManage = await this.isLead(teamId, currentUser);
    if (!canManage) {
      throw new Error('Only team leads can assign projects');
    }

    const project = await projectRepository.findById(projectId);
    if (!project) {
      throw new Error('Project not found');
    }

    if (currentUser.role !== UserRole.ADMIN) {
      const hasAccess = await projectService.hasAccess(projectId, currentUser);
      if (!hasAccess) {
        throw new Error('You do not have access to this project');
      }
    }

    const existing = await teamProjectRepository.findMembership(teamId, projectId);
    if (existing) {
      throw new Error('Project is already assigned to this team');
    }

    const teamProject = await teamProjectRepository.addProject(teamId, projectId);

    const members = await teamMemberRepository.findByTeamId(teamId);
    for (const member of members) {
      await this.ensureTeamProjectMember(projectId, member.userId, teamId);
    }

    return teamProject;
  }

  async unassignProject(teamId: string, projectId: string, currentUser: User): Promise<boolean> {
    const canManage = await this.isLead(teamId, currentUser);
    if (!canManage) {
      throw new Error('Only team leads can unassign projects');
    }

    if (currentUser.role !== UserRole.ADMIN) {
      const hasAccess = await projectService.hasAccess(projectId, currentUser);
      if (!hasAccess) {
        throw new Error('You do not have access to this project');
      }
    }

    const removed = await teamProjectRepository.removeProject(teamId, projectId);
    if (!removed) {
      return false;
    }

    const members = await teamMemberRepository.findByTeamId(teamId);
    for (const member of members) {
      await this.removeTeamAccessFromProject(projectId, member.userId, teamId);
    }

    return true;
  }

  async hasAccess(teamId: string, user: User): Promise<boolean> {
    if (user.role === UserRole.ADMIN) {
      return true;
    }
    return teamMemberRepository.isMember(teamId, user.id);
  }

  async isLead(teamId: string, user: User): Promise<boolean> {
    if (user.role === UserRole.ADMIN) {
      return true;
    }
    return teamMemberRepository.isLead(teamId, user.id);
  }

  private async buildSummary(team: Team): Promise<TeamSummary> {
    const [members, projects] = await Promise.all([
      teamMemberRepository.findByTeamId(team.id),
      teamProjectRepository.findProjectIdsByTeamId(team.id),
    ]);

    return {
      ...team,
      memberCount: members.length,
      projectCount: projects.length,
    };
  }

  private async ensureTeamProjectMember(projectId: string, userId: string, teamId: string): Promise<void> {
    const existing = await projectMemberRepository.findMembership(projectId, userId);
    if (!existing) {
      await projectMemberRepository.addMember(
        projectId,
        userId,
        ProjectMemberRole.MEMBER,
        ProjectMemberSource.TEAM,
        teamId
      );
      return;
    }

    if (existing.source === ProjectMemberSource.TEAM && !existing.sourceTeamId) {
      await projectMemberRepository.updateMembership(projectId, userId, {
        source: ProjectMemberSource.TEAM,
        sourceTeamId: teamId,
        role: ProjectMemberRole.MEMBER,
      });
    }
  }

  private async removeTeamAccessFromProject(projectId: string, userId: string, teamId: string): Promise<void> {
    const existing = await projectMemberRepository.findMembership(projectId, userId);
    if (!existing) {
      return;
    }

    if (existing.source === ProjectMemberSource.DIRECT) {
      return;
    }

    const otherTeamIds = await teamProjectRepository.findTeamIdsForUserProject(userId, projectId, teamId);
    if (otherTeamIds.length > 0) {
      await projectMemberRepository.updateMembership(projectId, userId, {
        source: ProjectMemberSource.TEAM,
        sourceTeamId: otherTeamIds[0],
        role: ProjectMemberRole.MEMBER,
      });
      return;
    }

    await projectMemberRepository.removeMember(projectId, userId);
  }
}

export const teamService = new TeamService();

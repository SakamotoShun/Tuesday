import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { TeamMemberRole, UserRole } from '../db/schema';

let findAll: (...args: any[]) => Promise<any> = async () => [];
let findByUserId: (...args: any[]) => Promise<any> = async () => [];
let findById: (...args: any[]) => Promise<any> = async () => null;
let createTeam: (...args: any[]) => Promise<any> = async (data) => ({ id: 'team-1', ...data });
let updateTeam: (...args: any[]) => Promise<any> = async (_id, data) => ({ id: 'team-1', ...data });
let deleteTeam: (...args: any[]) => Promise<any> = async () => true;

let findMembersByTeam: (...args: any[]) => Promise<any> = async () => [];
let isMember: (...args: any[]) => Promise<any> = async () => true;
let isLead: (...args: any[]) => Promise<any> = async () => true;
let findMembership: (...args: any[]) => Promise<any> = async () => null;
let addTeamMember: (...args: any[]) => Promise<any> = async () => ({ id: 'team-member-1' });
let updateRole: (...args: any[]) => Promise<any> = async (_teamId, _userId, role) => ({ role });
let removeTeamMember: (...args: any[]) => Promise<any> = async () => true;

let findProjectIdsByTeamId: (...args: any[]) => Promise<any> = async () => [];
let findByTeamId: (...args: any[]) => Promise<any> = async () => [];
let findProjectById: (...args: any[]) => Promise<any> = async () => ({ id: 'project-1', name: 'Project' });
let findTeamProjectMembership: (...args: any[]) => Promise<any> = async () => null;
let addProject: (...args: any[]) => Promise<any> = async () => ({ teamId: 'team-1', projectId: 'project-1' });
let removeProject: (...args: any[]) => Promise<any> = async () => true;

let projectMemberFindMembership: (...args: any[]) => Promise<any> = async () => null;
let projectMemberAdd: (...args: any[]) => Promise<any> = async () => ({ id: 'member-1' });
let projectMemberUpdateMembership: (...args: any[]) => Promise<any> = async () => ({ id: 'member-1' });

mock.module('../repositories/team', () => ({
  TeamRepository: class {},
  teamRepository: {
    findAll: () => findAll(),
    findByUserId: (userId: string) => findByUserId(userId),
    findById: (teamId: string) => findById(teamId),
    create: (data: any) => createTeam(data),
    update: (teamId: string, data: any) => updateTeam(teamId, data),
    delete: (teamId: string) => deleteTeam(teamId),
  },
}));

mock.module('../repositories/teamMember', () => ({
  TeamMemberRepository: class {},
  teamMemberRepository: {
    findByTeamId: (teamId: string) => findMembersByTeam(teamId),
    isMember: (teamId: string, userId: string) => isMember(teamId, userId),
    isLead: (teamId: string, userId: string) => isLead(teamId, userId),
    findMembership: (teamId: string, userId: string) => findMembership(teamId, userId),
    addMember: (teamId: string, userId: string, role: string) => addTeamMember(teamId, userId, role),
    updateRole: (teamId: string, userId: string, role: string) => updateRole(teamId, userId, role),
    removeMember: (teamId: string, userId: string) => removeTeamMember(teamId, userId),
  },
}));

mock.module('../repositories/teamProject', () => ({
  TeamProjectRepository: class {},
  teamProjectRepository: {
    findProjectIdsByTeamId: (teamId: string) => findProjectIdsByTeamId(teamId),
    findByTeamId: (teamId: string) => findByTeamId(teamId),
    findMembership: (teamId: string, projectId: string) => findTeamProjectMembership(teamId, projectId),
    addProject: (teamId: string, projectId: string) => addProject(teamId, projectId),
    removeProject: (teamId: string, projectId: string) => removeProject(teamId, projectId),
  },
}));

mock.module('../repositories/project', () => ({
  ProjectRepository: class {},
  projectRepository: {
    findById: (projectId: string) => findProjectById(projectId),
  },
}));

mock.module('../repositories/projectMember', () => ({
  ProjectMemberRepository: class {},
  projectMemberRepository: {
    findMembership: (projectId: string, userId: string) => projectMemberFindMembership(projectId, userId),
    addMember: (projectId: string, userId: string, role: string, source?: any, sourceTeamId?: any) =>
      projectMemberAdd(projectId, userId, role, source, sourceTeamId),
    updateMembership: (projectId: string, userId: string, data: any) => projectMemberUpdateMembership(projectId, userId, data),
  },
}));

const { teamService } = await import('./team');

const memberUser = {
  id: 'user-1',
  email: 'user@example.com',
  name: 'User',
  role: UserRole.MEMBER,
  isDisabled: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  avatarUrl: null,
};

const adminUser = {
  ...memberUser,
  role: UserRole.ADMIN,
};

describe('TeamService', () => {
  beforeEach(() => {
    findAll = async () => [];
    findByUserId = async () => [];
    findById = async () => null;
    createTeam = async (data) => ({ id: 'team-1', ...data });
    updateTeam = async (_id, data) => ({ id: 'team-1', ...data });
    deleteTeam = async () => true;
    findMembersByTeam = async () => [];
    isMember = async () => true;
    isLead = async () => true;
    findMembership = async () => null;
    addTeamMember = async () => ({ id: 'team-member-1' });
    updateRole = async (_teamId, _userId, role) => ({ role });
    removeTeamMember = async () => true;
    findProjectIdsByTeamId = async () => [];
    findByTeamId = async () => [];
    findProjectById = async () => ({ id: 'project-1', name: 'Project' });
    findTeamProjectMembership = async () => null;
    addProject = async () => ({ teamId: 'team-1', projectId: 'project-1' });
    removeProject = async () => true;
    projectMemberFindMembership = async () => null;
    projectMemberAdd = async () => ({ id: 'member-1' });
    projectMemberUpdateMembership = async () => ({ id: 'member-1' });
  });

  it('lists all teams for admin', async () => {
    findAll = async () => [{ id: 'team-1', name: 'Team' }];
    const teams = await teamService.listTeams(adminUser);
    expect(teams[0].id).toBe('team-1');
  });

  it('lists member teams for non-admin', async () => {
    findByUserId = async () => [{ id: 'team-2', name: 'Team' }];
    const teams = await teamService.listTeams(memberUser);
    expect(teams[0].id).toBe('team-2');
  });

  it('rejects team creation for non-admin', async () => {
    await expect(teamService.createTeam({ name: 'Team' }, memberUser)).rejects.toThrow('Only admins can create teams');
  });

  it('rejects empty team name', async () => {
    await expect(teamService.createTeam({ name: '' }, adminUser)).rejects.toThrow('Team name is required');
  });

  it('rejects removing the only team lead', async () => {
    findMembership = async () => ({ role: TeamMemberRole.LEAD, userId: 'user-2' });
    findMembersByTeam = async () => [{ role: TeamMemberRole.LEAD, userId: 'user-2' }];
    await expect(teamService.removeMember('team-1', 'user-2', adminUser)).rejects.toThrow('Cannot remove the only team lead');
  });

  it('rejects assign project when not lead', async () => {
    isLead = async () => false;
    await expect(teamService.assignProject('team-1', 'project-1', memberUser)).rejects.toThrow(
      'Only team leads can assign projects'
    );
  });

  it('rejects assigning missing project', async () => {
    findProjectById = async () => null;
    await expect(teamService.assignProject('team-1', 'project-1', adminUser)).rejects.toThrow('Project not found');
  });

  it('rejects duplicate project assignment', async () => {
    findTeamProjectMembership = async () => ({ teamId: 'team-1', projectId: 'project-1' });
    await expect(teamService.assignProject('team-1', 'project-1', adminUser)).rejects.toThrow(
      'Project is already assigned to this team'
    );
  });

  it('returns false when unassign does not remove', async () => {
    removeProject = async () => false;
    const result = await teamService.unassignProject('team-1', 'project-1', adminUser);
    expect(result).toBe(false);
  });
});

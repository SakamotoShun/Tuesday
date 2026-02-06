import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { ProjectMemberRole, ProjectMemberSource, UserRole } from '../db/schema';

let findAll: (...args: any[]) => Promise<any> = async () => [];
let findByUserId: (...args: any[]) => Promise<any> = async () => [];
let findById: (...args: any[]) => Promise<any> = async () => null;
let createProject: (...args: any[]) => Promise<any> = async (_data) => ({ id: 'project-1' });
let updateProject: (...args: any[]) => Promise<any> = async (_projectId, data) => ({ id: 'project-1', ...data });
let deleteProject: (...args: any[]) => Promise<any> = async () => true;

let isMember: (...args: any[]) => Promise<any> = async () => true;
let isOwner: (...args: any[]) => Promise<any> = async () => true;
let findByProjectId: (...args: any[]) => Promise<any> = async () => [];
let findMembership: (...args: any[]) => Promise<any> = async () => null;
let addMember: (...args: any[]) => Promise<any> = async () => ({
  projectId: 'project-1',
  userId: 'user-2',
  role: ProjectMemberRole.MEMBER,
});
let updateMembership: (...args: any[]) => Promise<any> = async () => ({
  projectId: 'project-1',
  userId: 'user-2',
  role: ProjectMemberRole.MEMBER,
  source: ProjectMemberSource.DIRECT,
  sourceTeamId: null,
});
let updateRole: (...args: any[]) => Promise<any> = async (_projectId, _userId, role) => ({
  projectId: 'project-1',
  userId: 'user-2',
  role,
});
let removeMember: (...args: any[]) => Promise<any> = async () => true;

let findDefaultStatus: (...args: any[]) => Promise<any> = async () => ({ id: 'status-default' });
let findStatusById: (...args: any[]) => Promise<any> = async (id) => ({ id, name: 'Status' });

let findTeamsByProjectId: (...args: any[]) => Promise<any> = async () => [];
let findTeamIdsForUserProject: (...args: any[]) => Promise<any> = async () => [];

let cleanupProjectFiles: (...args: any[]) => Promise<any> = async () => 0;

mock.module('../repositories/project', () => ({
  ProjectRepository: class {},
  projectRepository: {
    findAll: () => findAll(),
    findByUserId: (userId: string) => findByUserId(userId),
    findById: (projectId: string) => findById(projectId),
    create: (data: any) => createProject(data),
    update: (projectId: string, data: any) => updateProject(projectId, data),
    delete: (projectId: string) => deleteProject(projectId),
  },
}));

mock.module('../repositories/projectMember', () => ({
  ProjectMemberRepository: class {},
  projectMemberRepository: {
    isMember: (projectId: string, userId: string) => isMember(projectId, userId),
    isOwner: (projectId: string, userId: string) => isOwner(projectId, userId),
    findByProjectId: (projectId: string) => findByProjectId(projectId),
    findMembership: (projectId: string, userId: string) => findMembership(projectId, userId),
    addMember: (projectId: string, userId: string, role: string, source?: any, sourceTeamId?: any) =>
      addMember(projectId, userId, role),
    updateMembership: (projectId: string, userId: string, data: any) => updateMembership(projectId, userId, data),
    updateRole: (projectId: string, userId: string, role: string) => updateRole(projectId, userId, role),
    removeMember: (projectId: string, userId: string) => removeMember(projectId, userId),
  },
}));

mock.module('../repositories/projectStatus', () => ({
  ProjectStatusRepository: class {},
  projectStatusRepository: {
    findDefault: () => findDefaultStatus(),
    findById: (id: string) => findStatusById(id),
  },
}));

mock.module('../repositories/teamProject', () => ({
  TeamProjectRepository: class {},
  teamProjectRepository: {
    findTeamsByProjectId: (projectId: string) => findTeamsByProjectId(projectId),
    findTeamIdsForUserProject: (userId: string, projectId: string) => findTeamIdsForUserProject(userId, projectId),
  },
}));

mock.module('./file', () => ({
  fileService: {
    cleanupProjectFiles: (projectId: string) => cleanupProjectFiles(projectId),
  },
}));

const { projectService } = await import('./project');

const memberUser = {
  id: 'user-1',
  email: 'user@example.com',
  name: 'User',
  role: UserRole.MEMBER,
  isDisabled: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const adminUser = {
  ...memberUser,
  role: UserRole.ADMIN,
};

describe('ProjectService', () => {
  beforeEach(() => {
    findAll = async () => [];
    findByUserId = async () => [];
    findById = async () => null;
    createProject = async (data) => ({ id: 'project-1', ...data });
    updateProject = async (_projectId, data) => ({ id: 'project-1', ...data });
    deleteProject = async () => true;
    isMember = async () => true;
    isOwner = async () => true;
    findByProjectId = async () => [];
    findMembership = async () => null;
    addMember = async () => ({ projectId: 'project-1', userId: 'user-2', role: ProjectMemberRole.MEMBER });
    updateMembership = async () => ({ projectId: 'project-1', userId: 'user-2', role: ProjectMemberRole.MEMBER });
    updateRole = async (_projectId, _userId, role) => ({ projectId: 'project-1', userId: 'user-2', role });
    removeMember = async () => true;
    findDefaultStatus = async () => ({ id: 'status-default' });
    findStatusById = async (id) => ({ id, name: 'Status' });
    findTeamsByProjectId = async () => [];
    findTeamIdsForUserProject = async () => [];
    cleanupProjectFiles = async () => 0;
  });

  it('returns all projects for admin', async () => {
    findAll = async () => [{ id: 'project-1' }];
    const projects = await projectService.getProjects(adminUser);
    expect(projects).toEqual([{ id: 'project-1' }] as any);
  });

  it('returns member projects for non-admin', async () => {
    findByUserId = async () => [{ id: 'project-2' }];
    const projects = await projectService.getProjects(memberUser);
    expect(projects).toEqual([{ id: 'project-2' }] as any);
  });

  it('rejects project creation without name', async () => {
    await expect(projectService.createProject({ name: '' }, memberUser)).rejects.toThrow('Project name is required');
  });

  it('creates project with default status and owner membership', async () => {
    let memberAdded = false;
    addMember = async () => {
      memberAdded = true;
      return { projectId: 'project-1', userId: 'user-1', role: ProjectMemberRole.OWNER };
    };

    const project = await projectService.createProject({ name: 'New Project' }, memberUser);
    expect(project.statusId).toBe('status-default');
    expect(memberAdded).toBe(true);
  });

  it('rejects invalid status on create', async () => {
    findStatusById = async () => null;
    await expect(
      projectService.createProject({ name: 'Project', statusId: 'bad-status' }, memberUser)
    ).rejects.toThrow('Invalid status ID');
  });

  it('rejects update when not owner', async () => {
    isOwner = async () => false;
    await expect(
      projectService.updateProject('project-1', { name: 'Rename' }, memberUser)
    ).rejects.toThrow('Only project owners can update the project');
  });

  it('rejects update with invalid status', async () => {
    findStatusById = async () => null;
    await expect(
      projectService.updateProject('project-1', { statusId: 'bad-status' }, memberUser)
    ).rejects.toThrow('Invalid status ID');
  });

  it('deletes project after cleanup', async () => {
    let cleaned = false;
    cleanupProjectFiles = async () => {
      cleaned = true;
      return 0;
    };
    const ok = await projectService.deleteProject('project-1', memberUser);
    expect(ok).toBe(true);
    expect(cleaned).toBe(true);
  });

  it('rejects delete when not owner', async () => {
    isOwner = async () => false;
    await expect(projectService.deleteProject('project-1', memberUser)).rejects.toThrow(
      'Only project owners can delete the project'
    );
  });

  it('adds member when valid', async () => {
    findById = async () => null;
    const member = await projectService.addMember('project-1', 'user-2', ProjectMemberRole.MEMBER, memberUser);
    expect(member.userId).toBe('user-2');
  });

  it('rejects adding duplicate direct member', async () => {
    findMembership = async () => ({ source: ProjectMemberSource.DIRECT });
    await expect(
      projectService.addMember('project-1', 'user-2', ProjectMemberRole.MEMBER, memberUser)
    ).rejects.toThrow('User is already a member of this project');
  });

  it('converts team membership to direct', async () => {
    findMembership = async () => ({ source: ProjectMemberSource.TEAM });
    let updated = false;
    updateMembership = async () => {
      updated = true;
      return {
        projectId: 'project-1',
        userId: 'user-2',
        role: ProjectMemberRole.MEMBER,
        source: ProjectMemberSource.DIRECT,
        sourceTeamId: null,
      };
    };

    const member = await projectService.addMember('project-1', 'user-2', ProjectMemberRole.MEMBER, memberUser);
    expect(updated).toBe(true);
    expect(member.source).toBe(ProjectMemberSource.DIRECT);
  });

  it('rejects invalid member role', async () => {
    await expect(
      projectService.addMember('project-1', 'user-2', 'invalid', memberUser)
    ).rejects.toThrow('Invalid role');
  });

  it('rejects role changes for team members', async () => {
    findMembership = async () => ({ source: ProjectMemberSource.TEAM, role: ProjectMemberRole.MEMBER, userId: 'user-2' });
    await expect(
      projectService.updateMemberRole('project-1', 'user-2', ProjectMemberRole.MEMBER, memberUser)
    ).rejects.toThrow('Team members cannot have project roles changed');
  });

  it('rejects removing only owner', async () => {
    findMembership = async () => ({ role: ProjectMemberRole.OWNER, userId: memberUser.id });
    findByProjectId = async () => [{ role: ProjectMemberRole.OWNER, userId: memberUser.id }];
    await expect(
      projectService.removeMember('project-1', memberUser.id, memberUser)
    ).rejects.toThrow('Cannot remove yourself as the only owner');
  });

  it('returns false when removing non-member', async () => {
    findMembership = async () => null;
    const result = await projectService.removeMember('project-1', 'user-2', memberUser);
    expect(result).toBe(false);
  });

  it('reverts to team membership when assigned by team', async () => {
    findMembership = async () => ({ role: ProjectMemberRole.MEMBER, userId: 'user-2' });
    findTeamIdsForUserProject = async () => ['team-1'];
    let updated = false;
    updateMembership = async () => {
      updated = true;
      return {
        projectId: 'project-1',
        userId: 'user-2',
        role: ProjectMemberRole.MEMBER,
        source: ProjectMemberSource.TEAM,
        sourceTeamId: 'team-1',
      };
    };

    const result = await projectService.removeMember('project-1', 'user-2', memberUser);
    expect(result).toBe(true);
    expect(updated).toBe(true);
  });

  it('checks access for admin', async () => {
    const access = await projectService.hasAccess('project-1', adminUser);
    expect(access).toBe(true);
  });
});

import { projectRepository, projectMemberRepository, projectStatusRepository, teamProjectRepository } from '../repositories';
import { fileService } from './file';
import { ProjectMemberRole, ProjectMemberSource, UserRole } from '../db/schema';
import type { Project, ProjectMember, ProjectStatus, NewProject, NewProjectMember } from '../db/schema';
import type { ProjectWithRelations } from '../repositories/project';
import type { User } from '../types';

export interface CreateProjectInput {
  name: string;
  client?: string;
  statusId?: string;
  type?: string;
  startDate?: string;
  targetEndDate?: string;
}

export interface UpdateProjectInput {
  name?: string;
  client?: string | null;
  statusId?: string | null;
  type?: string | null;
  startDate?: string | null;
  targetEndDate?: string | null;
}

export interface ProjectWithMembers extends ProjectWithRelations {
  members?: (ProjectMember & { user: { id: string; name: string; email: string; avatarUrl: string | null } })[];
}

export class ProjectService {
  /**
   * Get all projects accessible to a user
   * - Members see only their projects
   * - Admins see all projects
   */
  async getProjects(user: User): Promise<Project[]> {
    if (user.role === UserRole.ADMIN) {
      return projectRepository.findAll();
    }
    return projectRepository.findByUserId(user.id);
  }

  /**
   * Get a single project by ID
   * - Members can only access their own projects
   * - Admins can access any project
   */
  async getProject(projectId: string, user: User): Promise<ProjectWithMembers | null> {
    const project = await projectRepository.findById(projectId);
    
    if (!project) {
      return null;
    }

    // Check access
    if (user.role !== UserRole.ADMIN) {
      const isMember = await projectMemberRepository.isMember(projectId, user.id);
      if (!isMember) {
        return null;
      }
    }

    // Load members for response
    const members = await projectMemberRepository.findByProjectId(projectId);

    return {
      ...project,
      members,
    };
  }

  /**
   * Create a new project
   * - Creator becomes the owner
   * - Owner is automatically added as a member
   */
  async createProject(input: CreateProjectInput, user: User): Promise<Project> {
    // Validate required fields
    if (!input.name || input.name.trim() === '') {
      throw new Error('Project name is required');
    }

    // Use default status if none provided
    let statusId = input.statusId;
    if (!statusId) {
      const defaultStatus = await projectStatusRepository.findDefault();
      statusId = defaultStatus?.id;
    }

    // Validate status exists
    if (statusId) {
      const status = await projectStatusRepository.findById(statusId);
      if (!status) {
        throw new Error('Invalid status ID');
      }
    }

    // Create project
    const project = await projectRepository.create({
      name: input.name.trim(),
      client: input.client?.trim() || null,
      statusId,
      ownerId: user.id,
      type: input.type?.trim() || null,
      startDate: input.startDate || null,
      targetEndDate: input.targetEndDate || null,
    });

    // Add creator as owner
    await projectMemberRepository.addMember(project.id, user.id, ProjectMemberRole.OWNER);

    return project;
  }

  /**
   * Update a project
   * - Only owner can update
   */
  async updateProject(projectId: string, input: UpdateProjectInput, user: User): Promise<Project | null> {
    // Check ownership
    const isOwner = await projectMemberRepository.isOwner(projectId, user.id);
    if (!isOwner && user.role !== UserRole.ADMIN) {
      throw new Error('Only project owners can update the project');
    }

    // Validate status if provided
    if (input.statusId) {
      const status = await projectStatusRepository.findById(input.statusId);
      if (!status) {
        throw new Error('Invalid status ID');
      }
    }

    const updateData: Partial<NewProject> = {};
    
    if (input.name !== undefined) {
      if (input.name.trim() === '') {
        throw new Error('Project name cannot be empty');
      }
      updateData.name = input.name.trim();
    }
    
    if (input.client !== undefined) {
      updateData.client = input.client ? input.client.trim() : null;
    }
    
    if (input.statusId !== undefined) {
      updateData.statusId = input.statusId;
    }
    
    if (input.type !== undefined) {
      updateData.type = input.type ? input.type.trim() : null;
    }
    
    if (input.startDate !== undefined) {
      updateData.startDate = input.startDate || null;
    }
    
    if (input.targetEndDate !== undefined) {
      updateData.targetEndDate = input.targetEndDate || null;
    }

    return projectRepository.update(projectId, updateData);
  }

  /**
   * Delete a project
   * - Only owner can delete
   * - Cleans up all attached files before deletion
   */
  async deleteProject(projectId: string, user: User): Promise<boolean> {
    // Check ownership
    const isOwner = await projectMemberRepository.isOwner(projectId, user.id);
    if (!isOwner && user.role !== UserRole.ADMIN) {
      throw new Error('Only project owners can delete the project');
    }

    // Clean up all files in project channels before cascade delete
    await fileService.cleanupProjectFiles(projectId);

    return projectRepository.delete(projectId);
  }

  /**
   * Get project members
   */
  async getMembers(projectId: string, user: User): Promise<(ProjectMember & { user: { id: string; name: string; email: string; avatarUrl: string | null } })[]> {
    // Check access
    if (user.role !== UserRole.ADMIN) {
      const isMember = await projectMemberRepository.isMember(projectId, user.id);
      if (!isMember) {
        throw new Error('Access denied');
      }
    }

    return projectMemberRepository.findByProjectId(projectId);
  }

  /**
   * Get teams assigned to a project
   */
  async getAssignedTeams(projectId: string, user: User) {
    if (user.role !== UserRole.ADMIN) {
      const isOwner = await projectMemberRepository.isOwner(projectId, user.id);
      if (!isOwner) {
        throw new Error('Only project owners can view team assignments');
      }
    }

    return teamProjectRepository.findTeamsByProjectId(projectId);
  }

  /**
   * Add a member to a project
   * - Only owner can add members
   */
  async addMember(projectId: string, userId: string, role: string = ProjectMemberRole.MEMBER, currentUser: User): Promise<ProjectMember> {
    // Check ownership
    const isOwner = await projectMemberRepository.isOwner(projectId, currentUser.id);
    if (!isOwner && currentUser.role !== UserRole.ADMIN) {
      throw new Error('Only project owners can add members');
    }

    // Check if user is already a member
    const existing = await projectMemberRepository.findMembership(projectId, userId);
    if (existing) {
      if (existing.source === ProjectMemberSource.TEAM) {
        const updated = await projectMemberRepository.updateMembership(projectId, userId, {
          role,
          source: ProjectMemberSource.DIRECT,
          sourceTeamId: null,
        });
        if (!updated) {
          throw new Error('Failed to update membership');
        }
        return updated;
      }
      throw new Error('User is already a member of this project');
    }

    // Validate role
    if (role !== ProjectMemberRole.OWNER && role !== ProjectMemberRole.MEMBER) {
      throw new Error('Invalid role');
    }

    const member = await projectMemberRepository.addMember(projectId, userId, role, ProjectMemberSource.DIRECT, null);

    const project = await projectRepository.findById(projectId);
    if (project) {
      const { notificationService } = await import('./notification');
      await notificationService.notifyProjectInvite({
        projectId: project.id,
        projectName: project.name,
        userId,
        invitedBy: currentUser.name,
      });
    }

    return member;
  }

  /**
   * Update a member's role
   * - Only owner can update roles
   */
  async updateMemberRole(projectId: string, userId: string, role: string, currentUser: User): Promise<ProjectMember | null> {
    // Check ownership
    const isOwner = await projectMemberRepository.isOwner(projectId, currentUser.id);
    if (!isOwner && currentUser.role !== UserRole.ADMIN) {
      throw new Error('Only project owners can update member roles');
    }

    const membership = await projectMemberRepository.findMembership(projectId, userId);
    if (!membership) {
      return null;
    }

    if (membership.source === ProjectMemberSource.TEAM) {
      throw new Error('Team members cannot have project roles changed');
    }

    // Cannot modify own role if you're the only owner
    if (userId === currentUser.id && role !== ProjectMemberRole.OWNER) {
      const members = await projectMemberRepository.findByProjectId(projectId);
      const owners = members.filter(m => m.role === ProjectMemberRole.OWNER);
      if (owners.length === 1 && owners[0].userId === currentUser.id) {
        throw new Error('Cannot remove yourself as the only owner');
      }
    }

    // Validate role
    if (role !== ProjectMemberRole.OWNER && role !== ProjectMemberRole.MEMBER) {
      throw new Error('Invalid role');
    }

    return projectMemberRepository.updateRole(projectId, userId, role);
  }

  /**
   * Remove a member from a project
   * - Only owner can remove members
   * - Cannot remove yourself if you're the only owner
   */
  async removeMember(projectId: string, userId: string, currentUser: User): Promise<boolean> {
    // Check ownership
    const isOwner = await projectMemberRepository.isOwner(projectId, currentUser.id);
    if (!isOwner && currentUser.role !== UserRole.ADMIN) {
      throw new Error('Only project owners can remove members');
    }

    const membership = await projectMemberRepository.findMembership(projectId, userId);
    if (!membership) {
      return false;
    }

    // Cannot remove yourself if you're the only owner
    if (userId === currentUser.id && membership.role === ProjectMemberRole.OWNER) {
      const members = await projectMemberRepository.findByProjectId(projectId);
      const owners = members.filter(m => m.role === ProjectMemberRole.OWNER);
      if (owners.length === 1 && owners[0].userId === currentUser.id) {
        throw new Error('Cannot remove yourself as the only owner');
      }
    }

    const teamIds = await teamProjectRepository.findTeamIdsForUserProject(userId, projectId);
    if (teamIds.length > 0) {
      await projectMemberRepository.updateMembership(projectId, userId, {
        role: ProjectMemberRole.MEMBER,
        source: ProjectMemberSource.TEAM,
        sourceTeamId: teamIds[0],
      });
      return true;
    }

    return projectMemberRepository.removeMember(projectId, userId);
  }

  /**
   * Check if user has access to a project
   */
  async hasAccess(projectId: string, user: User): Promise<boolean> {
    if (user.role === UserRole.ADMIN) {
      return true;
    }
    return projectMemberRepository.isMember(projectId, user.id);
  }

  /**
   * Check if user is a project owner
   */
  async isOwner(projectId: string, user: User): Promise<boolean> {
    if (user.role === UserRole.ADMIN) {
      return true;
    }
    return projectMemberRepository.isOwner(projectId, user.id);
  }
}

export const projectService = new ProjectService();

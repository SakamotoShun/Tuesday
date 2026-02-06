import { projectRepository, projectMemberRepository, projectStatusRepository, teamProjectRepository } from '../repositories';
import { fileService } from './file';
import { db } from '../db/client';
import { ProjectMemberRole, ProjectMemberSource, UserRole } from '../db/schema';
import { docs, tasks, channels, whiteboards } from '../db/schema';
import { eq, sql } from 'drizzle-orm';
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
  templateId?: string;
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

export interface ProjectTemplateWithCounts extends ProjectWithRelations {
  docCount: number;
  taskCount: number;
  channelCount: number;
  whiteboardCount: number;
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
   * - If templateId is provided, clones template content
   */
  async createProject(input: CreateProjectInput, user: User): Promise<Project> {
    // Validate required fields
    if (!input.name || input.name.trim() === '') {
      throw new Error('Project name is required');
    }

    // If templateId provided, delegate to template creation
    if (input.templateId) {
      return this.createProjectFromTemplate(input, user);
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
   * Create a new project from a template
   * Clones all template content (docs, tasks, channels, whiteboards)
   * with relative date preservation for tasks
   */
  private async createProjectFromTemplate(input: CreateProjectInput, user: User): Promise<Project> {
    const templateId = input.templateId!;

    // Verify template exists and is actually a template
    const template = await projectRepository.findById(templateId);
    if (!template) {
      throw new Error('Template not found');
    }
    if (!template.isTemplate) {
      throw new Error('Project is not a template');
    }

    // Use default status if none provided
    let statusId = input.statusId;
    if (!statusId) {
      const defaultStatus = await projectStatusRepository.findDefault();
      statusId = defaultStatus?.id;
    }

    if (statusId) {
      const status = await projectStatusRepository.findById(statusId);
      if (!status) {
        throw new Error('Invalid status ID');
      }
    }

    // Create the new project
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

    // Clone template content in a transaction
    await db.transaction(async (tx) => {
      // --- Clone Docs ---
      const templateDocs = await tx.query.docs.findMany({
        where: eq(docs.projectId, templateId),
      });

      if (templateDocs.length > 0) {
        // Build old-to-new ID mapping for parent relationships
        const docIdMap = new Map<string, string>();

        // First pass: create all docs without parentId to get new IDs
        for (const doc of templateDocs) {
          const [newDoc] = await tx.insert(docs).values({
            projectId: project.id,
            parentId: null, // Will be updated in second pass
            title: doc.title,
            content: doc.content,
            properties: doc.properties,
            isDatabase: doc.isDatabase,
            schema: doc.schema,
            createdBy: user.id,
          }).returning();
          docIdMap.set(doc.id, newDoc.id);
        }

        // Second pass: update parentId references
        for (const doc of templateDocs) {
          if (doc.parentId && docIdMap.has(doc.parentId)) {
            const newDocId = docIdMap.get(doc.id)!;
            const newParentId = docIdMap.get(doc.parentId)!;
            await tx.update(docs)
              .set({ parentId: newParentId })
              .where(eq(docs.id, newDocId));
          }
        }
      }

      // --- Clone Tasks (with relative date preservation) ---
      const templateTasks = await tx.query.tasks.findMany({
        where: eq(tasks.projectId, templateId),
      });

      if (templateTasks.length > 0) {
        const templateStartDate = template.startDate ? new Date(template.startDate) : null;
        const newStartDate = input.startDate ? new Date(input.startDate) : null;

        for (const task of templateTasks) {
          let newStartDate_task: string | null = null;
          let newDueDate: string | null = null;

          if (templateStartDate && newStartDate) {
            // Compute relative offsets and apply to new project start date
            if (task.startDate) {
              const taskStart = new Date(task.startDate);
              const offsetMs = taskStart.getTime() - templateStartDate.getTime();
              const newDate = new Date(newStartDate.getTime() + offsetMs);
              newStartDate_task = newDate.toISOString().split('T')[0];
            }
            if (task.dueDate) {
              const taskDue = new Date(task.dueDate);
              const offsetMs = taskDue.getTime() - templateStartDate.getTime();
              const newDate = new Date(newStartDate.getTime() + offsetMs);
              newDueDate = newDate.toISOString().split('T')[0];
            }
          }
          // If dates can't be computed (no template start or no new start), leave null

          await tx.insert(tasks).values({
            projectId: project.id,
            title: task.title,
            descriptionMd: task.descriptionMd,
            statusId: task.statusId,
            startDate: newStartDate_task,
            dueDate: newDueDate,
            sortOrder: task.sortOrder,
            createdBy: user.id,
          });
        }
      }

      // --- Clone Channels ---
      const templateChannels = await tx.query.channels.findMany({
        where: eq(channels.projectId, templateId),
      });

      for (const channel of templateChannels) {
        await tx.insert(channels).values({
          projectId: project.id,
          name: channel.name,
          description: channel.description,
          type: 'project',
          access: channel.access,
        });
      }

      // --- Clone Whiteboards ---
      const templateWhiteboards = await tx.query.whiteboards.findMany({
        where: eq(whiteboards.projectId, templateId),
      });

      for (const wb of templateWhiteboards) {
        await tx.insert(whiteboards).values({
          projectId: project.id,
          name: wb.name,
          data: wb.data,
          createdBy: user.id,
        });
      }
    });

    return project;
  }

  /**
   * Get all available project templates (for template picker)
   * Returns templates with content counts
   */
  async getTemplates(): Promise<ProjectTemplateWithCounts[]> {
    const templates = await projectRepository.findTemplates();

    // Get content counts for each template
    const templatesWithCounts: ProjectTemplateWithCounts[] = await Promise.all(
      templates.map(async (template) => {
        const [docCount, taskCount, channelCount, whiteboardCount] = await Promise.all([
          db.select({ count: sql<number>`count(*)` }).from(docs).where(eq(docs.projectId, template.id)),
          db.select({ count: sql<number>`count(*)` }).from(tasks).where(eq(tasks.projectId, template.id)),
          db.select({ count: sql<number>`count(*)` }).from(channels).where(eq(channels.projectId, template.id)),
          db.select({ count: sql<number>`count(*)` }).from(whiteboards).where(eq(whiteboards.projectId, template.id)),
        ]);

        return {
          ...template,
          docCount: Number(docCount[0]?.count ?? 0),
          taskCount: Number(taskCount[0]?.count ?? 0),
          channelCount: Number(channelCount[0]?.count ?? 0),
          whiteboardCount: Number(whiteboardCount[0]?.count ?? 0),
        };
      })
    );

    return templatesWithCounts;
  }

  /**
   * Toggle a project's template status (admin only)
   */
  async toggleTemplate(projectId: string, isTemplate: boolean, user: User): Promise<Project> {
    if (user.role !== UserRole.ADMIN) {
      throw new Error('Only admins can manage templates');
    }

    const project = await projectRepository.findById(projectId);
    if (!project) {
      throw new Error('Project not found');
    }

    const updated = await projectRepository.setTemplate(projectId, isTemplate);
    if (!updated) {
      throw new Error('Failed to update template status');
    }

    return updated;
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

import { Hono } from 'hono';
import { projectStatusRepository, taskStatusRepository, settingsRepository, userRepository } from '../repositories';
import { db } from '../db/client';
import {
  ProjectMemberRole,
  ProjectMemberSource,
  UserRole,
  docCollabUpdates,
  docs,
  meetings,
  projectMembers,
  projects,
  tasks,
  users,
  whiteboardCollabUpdates,
  whiteboards,
} from '../db/schema';
import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import { fileService } from '../services/file';
import { auth, requireAdmin } from '../middleware';
import { success, errors } from '../utils/response';
import { 
  validateBody, 
  formatValidationErrors,
  createStatusSchema, 
  updateStatusSchema,
  reorderStatusSchema,
  toggleTemplateSchema,
  emailSchema,
  nameSchema,
  passwordSchema,
  uuidSchema,
} from '../utils/validation';
import { projectService } from '../services/project';
import { z } from 'zod';
import { hashPassword } from '../utils/password';

// Schema for updating admin settings
const updateSettingsSchema = z.object({
  allowRegistration: z.boolean().optional(),
  workspaceName: z.string().max(255).optional(),
});

const createUserSchema = z.object({
  email: emailSchema,
  name: nameSchema,
  role: z.enum(['admin', 'member']).default('member'),
  password: passwordSchema.optional(),
});

const updateUserSchema = z.object({
  role: z.enum(['admin', 'member']).optional(),
  isDisabled: z.boolean().optional(),
});

const deleteUserSchema = z.object({
  projectTransfers: z.array(z.object({
    projectId: uuidSchema,
    newOwnerId: uuidSchema,
  })).optional(),
  reassignToUserId: uuidSchema.optional(),
});

async function getCreatedContentCounts(userId: string) {
  const [docsCount, tasksCount, meetingsCount, whiteboardsCount, docUpdatesCount, whiteboardUpdatesCount] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(docs).where(eq(docs.createdBy, userId)),
    db.select({ count: sql<number>`count(*)` }).from(tasks).where(eq(tasks.createdBy, userId)),
    db.select({ count: sql<number>`count(*)` }).from(meetings).where(eq(meetings.createdBy, userId)),
    db.select({ count: sql<number>`count(*)` }).from(whiteboards).where(eq(whiteboards.createdBy, userId)),
    db.select({ count: sql<number>`count(*)` }).from(docCollabUpdates).where(eq(docCollabUpdates.actorId, userId)),
    db.select({ count: sql<number>`count(*)` }).from(whiteboardCollabUpdates).where(eq(whiteboardCollabUpdates.actorId, userId)),
  ]);

  return {
    docs: Number(docsCount[0]?.count ?? 0),
    tasks: Number(tasksCount[0]?.count ?? 0),
    meetings: Number(meetingsCount[0]?.count ?? 0),
    whiteboards: Number(whiteboardsCount[0]?.count ?? 0),
    docCollabUpdates: Number(docUpdatesCount[0]?.count ?? 0),
    whiteboardCollabUpdates: Number(whiteboardUpdatesCount[0]?.count ?? 0),
  };
}

async function getOwnedProjects(userId: string) {
  return db.query.projects.findMany({
    where: eq(projects.ownerId, userId),
    columns: {
      id: true,
      name: true,
      ownerId: true,
    },
  });
}

async function getOtherActiveAdminCount(userId: string) {
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(users)
    .where(and(eq(users.role, UserRole.ADMIN), eq(users.isDisabled, false), ne(users.id, userId)));
  return Number(result[0]?.count ?? 0);
}

const admin = new Hono();

// All admin routes require authentication and admin role
admin.use('*', auth, requireAdmin);

// ========== SETTINGS ==========

// GET /api/v1/admin/settings - Get admin settings
admin.get('/settings', async (c) => {
  try {
    const allowRegistration = await settingsRepository.get<boolean>('allow_registration');
    const updatedWorkspaceName = await settingsRepository.get<string>('workspace_name');
    
    return success(c, {
      allowRegistration: allowRegistration ?? false,
      workspaceName: updatedWorkspaceName ?? '',
    });
  } catch (error) {
    console.error('Error fetching admin settings:', error);
    return errors.internal(c, 'Failed to fetch settings');
  }
});

// PATCH /api/v1/admin/settings - Update admin settings
admin.patch('/settings', async (c) => {
  try {
    const body = await c.req.json();

    const validation = updateSettingsSchema.safeParse(body);
    if (!validation.success) {
      return errors.validation(c, formatValidationErrors(validation.error));
    }

    const { allowRegistration, workspaceName } = validation.data;

    if (allowRegistration !== undefined) {
      await settingsRepository.set('allow_registration', allowRegistration);
    }

    if (workspaceName !== undefined) {
      await settingsRepository.set('workspace_name', workspaceName.trim());
    }

    // Return updated settings
    const updatedAllowRegistration = await settingsRepository.get<boolean>('allow_registration');
    const updatedWorkspaceName = await settingsRepository.get<string>('workspace_name');

    return success(c, {
      allowRegistration: updatedAllowRegistration ?? false,
      workspaceName: updatedWorkspaceName ?? '',
    });
  } catch (error) {
    console.error('Error updating admin settings:', error);
    return errors.internal(c, 'Failed to update settings');
  }
});

// ========== PROJECT STATUSES ==========

// ========== USERS ==========

// GET /api/v1/admin/users - List users
admin.get('/users', async (c) => {
  try {
    const users = await userRepository.findAllDetailed();
    return success(c, users);
  } catch (error) {
    console.error('Error fetching users:', error);
    return errors.internal(c, 'Failed to fetch users');
  }
});

// POST /api/v1/admin/users - Create user (invite)
admin.post('/users', async (c) => {
  try {
    const body = await c.req.json();
    const validation = validateBody(createUserSchema, body);
    if (!validation.success) {
      return errors.validation(c, formatValidationErrors(validation.errors));
    }

    const existing = await userRepository.findByEmail(validation.data.email);
    if (existing) {
      return errors.conflict(c, 'User already exists');
    }

    const password = validation.data.password ?? crypto.randomUUID().replace(/-/g, '').slice(0, 12);
    const passwordHash = await hashPassword(password);

    const created = await userRepository.create({
      email: validation.data.email,
      name: validation.data.name,
      role: validation.data.role,
      passwordHash,
    });

    return success(
      c,
      {
        id: created.id,
        email: created.email,
        name: created.name,
        role: created.role,
        isDisabled: created.isDisabled,
        createdAt: created.createdAt,
        updatedAt: created.updatedAt,
        temporaryPassword: validation.data.password ? undefined : password,
      },
      undefined,
      201
    );
  } catch (error) {
    console.error('Error creating user:', error);
    return errors.internal(c, 'Failed to create user');
  }
});

// PATCH /api/v1/admin/users/:id - Update user
admin.patch('/users/:id', async (c) => {
  try {
    const userId = c.req.param('id');
    const body = await c.req.json();
    const validation = validateBody(updateUserSchema, body);
    if (!validation.success) {
      return errors.validation(c, formatValidationErrors(validation.errors));
    }

    const updated = await userRepository.update(userId, validation.data);
    if (!updated) {
      return errors.notFound(c, 'User not found');
    }

    return success(c, {
      id: updated.id,
      email: updated.email,
      name: updated.name,
      role: updated.role,
      isDisabled: updated.isDisabled,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    });
  } catch (error) {
    console.error('Error updating user:', error);
    return errors.internal(c, 'Failed to update user');
  }
});

// GET /api/v1/admin/users/:id/ownerships - Get ownership and created content counts
admin.get('/users/:id/ownerships', async (c) => {
  try {
    const userId = c.req.param('id');
    const user = await userRepository.findById(userId);

    if (!user) {
      return errors.notFound(c, 'User not found');
    }

    const [ownedProjects, createdContent] = await Promise.all([
      getOwnedProjects(userId),
      getCreatedContentCounts(userId),
    ]);

    const isLastAdmin = user.role === UserRole.ADMIN
      ? (await getOtherActiveAdminCount(userId)) === 0
      : false;

    return success(c, {
      ownedProjects,
      createdContent,
      isLastAdmin,
    });
  } catch (error) {
    console.error('Error fetching user ownerships:', error);
    return errors.internal(c, 'Failed to fetch user ownerships');
  }
});

// DELETE /api/v1/admin/users/:id - Delete user permanently
admin.delete('/users/:id', async (c) => {
  try {
    const userId = c.req.param('id');
    const currentUser = c.get('user');

    // Prevent self-deletion
    if (userId === currentUser.id) {
      return errors.badRequest(c, 'Cannot delete your own account');
    }

    const user = await userRepository.findById(userId);
    if (!user) {
      return errors.notFound(c, 'User not found');
    }

    if (user.role === UserRole.ADMIN) {
      const otherAdminCount = await getOtherActiveAdminCount(userId);
      if (otherAdminCount === 0) {
        return errors.badRequest(c, 'Cannot delete the last active admin');
      }
    }

    const [ownedProjects, createdContent] = await Promise.all([
      getOwnedProjects(userId),
      getCreatedContentCounts(userId),
    ]);

    const createdContentTotal = Object.values(createdContent).reduce((total, count) => total + count, 0);
    if (ownedProjects.length > 0 || createdContentTotal > 0) {
      return errors.badRequest(c, 'User has owned projects or created content that must be transferred before deletion');
    }

    // Clean up all files uploaded by user before cascade delete
    // This deletes physical files from disk; DB records will cascade
    await fileService.cleanupUserFiles(userId);

    const deleted = await userRepository.delete(userId);
    if (!deleted) {
      return errors.internal(c, 'Failed to delete user');
    }

    return success(c, { deleted: true });
  } catch (error) {
    console.error('Error deleting user:', error);
    return errors.internal(c, 'Failed to delete user');
  }
});

// POST /api/v1/admin/users/:id/delete - Delete user with transfers
admin.post('/users/:id/delete', async (c) => {
  try {
    const userId = c.req.param('id');
    const currentUser = c.get('user');
    const body = await c.req.json();
    const validation = validateBody(deleteUserSchema, body);

    if (!validation.success) {
      return errors.validation(c, formatValidationErrors(validation.errors));
    }

    // Prevent self-deletion
    if (userId === currentUser.id) {
      return errors.badRequest(c, 'Cannot delete your own account');
    }

    const user = await userRepository.findById(userId);
    if (!user) {
      return errors.notFound(c, 'User not found');
    }

    if (user.role === UserRole.ADMIN) {
      const otherAdminCount = await getOtherActiveAdminCount(userId);
      if (otherAdminCount === 0) {
        return errors.badRequest(c, 'Cannot delete the last active admin');
      }
    }

    const [ownedProjects, createdContent] = await Promise.all([
      getOwnedProjects(userId),
      getCreatedContentCounts(userId),
    ]);

    const createdContentTotal = Object.values(createdContent).reduce((total, count) => total + count, 0);
    const projectTransfers = validation.data.projectTransfers ?? [];
    const reassignToUserId = validation.data.reassignToUserId;

    if (createdContentTotal > 0 && !reassignToUserId) {
      return errors.badRequest(c, 'Created content must be reassigned before deletion');
    }

    if (reassignToUserId && reassignToUserId === userId) {
      return errors.badRequest(c, 'Reassignment user must be different from the deleted user');
    }

    const ownedProjectIds = new Set(ownedProjects.map((project) => project.id));
    const transferProjectIds = new Set(projectTransfers.map((transfer) => transfer.projectId));

    if (ownedProjects.length > 0) {
      const missingTransfers = ownedProjects.filter((project) => !transferProjectIds.has(project.id));
      if (missingTransfers.length > 0) {
        return errors.badRequest(c, 'All owned projects must be transferred before deletion');
      }
    }

    const invalidTransfers = projectTransfers.filter((transfer) => !ownedProjectIds.has(transfer.projectId));
    if (invalidTransfers.length > 0) {
      return errors.badRequest(c, 'Cannot transfer projects not owned by the user');
    }

    if (projectTransfers.some((transfer) => transfer.newOwnerId === userId)) {
      return errors.badRequest(c, 'Project ownership cannot be transferred to the deleted user');
    }

    const transferUserIds = new Set(projectTransfers.map((transfer) => transfer.newOwnerId));
    if (reassignToUserId) {
      transferUserIds.add(reassignToUserId);
    }

    if (transferUserIds.size === 0 && (ownedProjects.length > 0 || createdContentTotal > 0)) {
      return errors.badRequest(c, 'A transfer user is required to delete this account');
    }

    const transferUsers = transferUserIds.size > 0
      ? await db.query.users.findMany({ where: inArray(users.id, Array.from(transferUserIds)) })
      : [];
    const transferUserMap = new Map(transferUsers.map((transferUser) => [transferUser.id, transferUser]));

    const missingUserIds = Array.from(transferUserIds).filter((id) => !transferUserMap.has(id));
    if (missingUserIds.length > 0) {
      return errors.badRequest(c, 'Transfer user not found');
    }

    const disabledTransferUser = Array.from(transferUserMap.values()).find((transferUser) => transferUser.isDisabled);
    if (disabledTransferUser) {
      return errors.badRequest(c, 'Transfer user must be active');
    }

    // Clean up all files uploaded by user before cascade delete
    // This deletes physical files from disk; DB records will cascade
    await fileService.cleanupUserFiles(userId);

    const deleted = await db.transaction(async (tx) => {
      for (const transfer of projectTransfers) {
        await tx
          .update(projects)
          .set({ ownerId: transfer.newOwnerId, updatedAt: new Date() })
          .where(eq(projects.id, transfer.projectId));

        const membership = await tx.query.projectMembers.findFirst({
          where: and(
            eq(projectMembers.projectId, transfer.projectId),
            eq(projectMembers.userId, transfer.newOwnerId)
          ),
        });

        if (membership) {
          await tx
            .update(projectMembers)
            .set({
              role: ProjectMemberRole.OWNER,
              source: ProjectMemberSource.DIRECT,
              sourceTeamId: null,
            })
            .where(and(
              eq(projectMembers.projectId, transfer.projectId),
              eq(projectMembers.userId, transfer.newOwnerId)
            ));
        } else {
          await tx
            .insert(projectMembers)
            .values({
              projectId: transfer.projectId,
              userId: transfer.newOwnerId,
              role: ProjectMemberRole.OWNER,
              source: ProjectMemberSource.DIRECT,
              sourceTeamId: null,
            });
        }
      }

      if (reassignToUserId) {
        await tx.update(docs).set({ createdBy: reassignToUserId }).where(eq(docs.createdBy, userId));
        await tx.update(tasks).set({ createdBy: reassignToUserId }).where(eq(tasks.createdBy, userId));
        await tx.update(meetings).set({ createdBy: reassignToUserId }).where(eq(meetings.createdBy, userId));
        await tx.update(whiteboards).set({ createdBy: reassignToUserId }).where(eq(whiteboards.createdBy, userId));
        await tx.update(docCollabUpdates).set({ actorId: reassignToUserId }).where(eq(docCollabUpdates.actorId, userId));
        await tx.update(whiteboardCollabUpdates).set({ actorId: reassignToUserId }).where(eq(whiteboardCollabUpdates.actorId, userId));
      }

      const result = await tx.delete(users).where(eq(users.id, userId)).returning();
      return result.length > 0;
    });

    if (!deleted) {
      return errors.internal(c, 'Failed to delete user');
    }

    return success(c, { deleted: true });
  } catch (error) {
    console.error('Error deleting user with transfers:', error);
    return errors.internal(c, 'Failed to delete user');
  }
});

// GET /api/v1/admin/statuses/project - List project statuses
admin.get('/statuses/project', async (c) => {
  try {
    const statuses = await projectStatusRepository.findAll();
    return success(c, statuses);
  } catch (error) {
    console.error('Error fetching project statuses:', error);
    return errors.internal(c, 'Failed to fetch project statuses');
  }
});

// POST /api/v1/admin/statuses/project - Create project status
admin.post('/statuses/project', async (c) => {
  try {
    const body = await c.req.json();

    const validation = validateBody(createStatusSchema, body);
    if (!validation.success) {
      return errors.validation(c, formatValidationErrors(validation.errors));
    }

    const status = await projectStatusRepository.create(validation.data);
    return success(c, status, undefined, 201);
  } catch (error) {
    console.error('Error creating project status:', error);
    return errors.internal(c, 'Failed to create status');
  }
});

// PATCH /api/v1/admin/statuses/project/:id - Update project status
admin.patch('/statuses/project/:id', async (c) => {
  try {
    const statusId = c.req.param('id');
    const body = await c.req.json();

    const validation = validateBody(updateStatusSchema, body);
    if (!validation.success) {
      return errors.validation(c, formatValidationErrors(validation.errors));
    }

    const status = await projectStatusRepository.update(statusId, validation.data);

    if (!status) {
      return errors.notFound(c, 'Status not found');
    }

    return success(c, status);
  } catch (error) {
    console.error('Error updating project status:', error);
    return errors.internal(c, 'Failed to update status');
  }
});

// DELETE /api/v1/admin/statuses/project/:id - Delete project status
admin.delete('/statuses/project/:id', async (c) => {
  try {
    const statusId = c.req.param('id');

    const deleted = await projectStatusRepository.delete(statusId);

    if (!deleted) {
      return errors.notFound(c, 'Status not found');
    }

    return success(c, { deleted: true });
  } catch (error) {
    if (error instanceof Error) {
      return errors.badRequest(c, error.message);
    }
    console.error('Error deleting project status:', error);
    return errors.internal(c, 'Failed to delete status');
  }
});

// POST /api/v1/admin/statuses/project/reorder - Reorder project statuses
admin.post('/statuses/project/reorder', async (c) => {
  try {
    const body = await c.req.json();

    const validation = validateBody(reorderStatusSchema, body);
    if (!validation.success) {
      return errors.validation(c, formatValidationErrors(validation.errors));
    }

    await projectStatusRepository.reorder(validation.data.ids);
    return success(c, { reordered: true });
  } catch (error) {
    console.error('Error reordering project statuses:', error);
    return errors.internal(c, 'Failed to reorder statuses');
  }
});

// ========== TASK STATUSES ==========

// GET /api/v1/admin/statuses/task - List task statuses
admin.get('/statuses/task', async (c) => {
  try {
    const statuses = await taskStatusRepository.findAll();
    return success(c, statuses);
  } catch (error) {
    console.error('Error fetching task statuses:', error);
    return errors.internal(c, 'Failed to fetch task statuses');
  }
});

// POST /api/v1/admin/statuses/task - Create task status
admin.post('/statuses/task', async (c) => {
  try {
    const body = await c.req.json();

    const validation = validateBody(createStatusSchema, body);
    if (!validation.success) {
      return errors.validation(c, formatValidationErrors(validation.errors));
    }

    const status = await taskStatusRepository.create(validation.data);
    return success(c, status, undefined, 201);
  } catch (error) {
    console.error('Error creating task status:', error);
    return errors.internal(c, 'Failed to create status');
  }
});

// PATCH /api/v1/admin/statuses/task/:id - Update task status
admin.patch('/statuses/task/:id', async (c) => {
  try {
    const statusId = c.req.param('id');
    const body = await c.req.json();

    const validation = validateBody(updateStatusSchema, body);
    if (!validation.success) {
      return errors.validation(c, formatValidationErrors(validation.errors));
    }

    const status = await taskStatusRepository.update(statusId, validation.data);

    if (!status) {
      return errors.notFound(c, 'Status not found');
    }

    return success(c, status);
  } catch (error) {
    console.error('Error updating task status:', error);
    return errors.internal(c, 'Failed to update status');
  }
});

// DELETE /api/v1/admin/statuses/task/:id - Delete task status
admin.delete('/statuses/task/:id', async (c) => {
  try {
    const statusId = c.req.param('id');

    const deleted = await taskStatusRepository.delete(statusId);

    if (!deleted) {
      return errors.notFound(c, 'Status not found');
    }

    return success(c, { deleted: true });
  } catch (error) {
    if (error instanceof Error) {
      return errors.badRequest(c, error.message);
    }
    console.error('Error deleting task status:', error);
    return errors.internal(c, 'Failed to delete status');
  }
});

// POST /api/v1/admin/statuses/task/reorder - Reorder task statuses
admin.post('/statuses/task/reorder', async (c) => {
  try {
    const body = await c.req.json();

    const validation = validateBody(reorderStatusSchema, body);
    if (!validation.success) {
      return errors.validation(c, formatValidationErrors(validation.errors));
    }

    await taskStatusRepository.reorder(validation.data.ids);
    return success(c, { reordered: true });
  } catch (error) {
    console.error('Error reordering task statuses:', error);
    return errors.internal(c, 'Failed to reorder statuses');
  }
});

// ========== PROJECT TEMPLATES ==========

// GET /api/v1/admin/templates - List all project templates with content counts
admin.get('/templates', async (c) => {
  try {
    const templates = await projectService.getTemplates();
    return success(c, templates);
  } catch (error) {
    console.error('Error fetching templates:', error);
    return errors.internal(c, 'Failed to fetch templates');
  }
});

// GET /api/v1/admin/templates/projects - List all non-template projects (for template picker in admin)
admin.get('/templates/projects', async (c) => {
  try {
    const { projectRepository } = await import('../repositories');
    const allProjects = await projectRepository.findAll();
    return success(c, allProjects);
  } catch (error) {
    console.error('Error fetching projects for templates:', error);
    return errors.internal(c, 'Failed to fetch projects');
  }
});

// POST /api/v1/admin/templates/:id - Toggle project template status
admin.post('/templates/:id', async (c) => {
  try {
    const user = c.get('user');
    const projectId = c.req.param('id');
    const body = await c.req.json();

    const validation = validateBody(toggleTemplateSchema, body);
    if (!validation.success) {
      return errors.validation(c, formatValidationErrors(validation.errors));
    }

    const project = await projectService.toggleTemplate(projectId, validation.data.isTemplate, user);
    return success(c, project);
  } catch (error) {
    if (error instanceof Error) {
      return errors.badRequest(c, error.message);
    }
    console.error('Error toggling template:', error);
    return errors.internal(c, 'Failed to update template status');
  }
});

export { admin };

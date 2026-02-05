import { Hono } from 'hono';
import { projectStatusRepository, taskStatusRepository, settingsRepository, userRepository } from '../repositories';
import { fileService } from '../services/file';
import { auth, requireAdmin } from '../middleware';
import { success, errors } from '../utils/response';
import { 
  validateBody, 
  formatValidationErrors,
  createStatusSchema, 
  updateStatusSchema,
  reorderStatusSchema,
  emailSchema,
  nameSchema,
  passwordSchema,
} from '../utils/validation';
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

export { admin };

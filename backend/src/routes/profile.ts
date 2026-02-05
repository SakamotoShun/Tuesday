import { Hono } from 'hono';
import { auth } from '../middleware';
import { userRepository } from '../repositories';
import { fileService } from '../services/file';
import { success, errors } from '../utils/response';
import { validateBody, formatValidationErrors, updateProfileSchema, changePasswordSchema } from '../utils/validation';
import { hashPassword, verifyPassword } from '../utils/password';
import type { User as DbUser } from '../db/schema';

const profile = new Hono();

profile.use('*', auth);

const toPublicUser = (user: DbUser) => ({
  id: user.id,
  email: user.email,
  name: user.name,
  avatarUrl: user.avatarUrl,
  role: user.role as 'admin' | 'member',
  isDisabled: user.isDisabled,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

// GET /api/v1/profile - Get current user profile
profile.get('/', (c) => {
  const user = c.get('user');
  return success(c, { user });
});

// PATCH /api/v1/profile - Update profile (name)
profile.patch('/', async (c) => {
  try {
    const body = await c.req.json();
    const validation = validateBody(updateProfileSchema, body);
    if (!validation.success) {
      return errors.validation(c, formatValidationErrors(validation.errors));
    }

    if (validation.data.name === undefined) {
      return success(c, { user: c.get('user') });
    }

    const trimmedName = validation.data.name.trim();
    if (!trimmedName) {
      return errors.validation(c, [{ field: 'name', message: 'Name is required' }]);
    }

    const updated = await userRepository.update(c.get('user').id, {
      name: trimmedName,
    });

    if (!updated) {
      return errors.notFound(c, 'User not found');
    }

    return success(c, { user: toPublicUser(updated) });
  } catch (error) {
    console.error('Error updating profile:', error);
    return errors.internal(c, 'Failed to update profile');
  }
});

// POST /api/v1/profile/avatar - Upload avatar image
profile.post('/avatar', async (c) => {
  try {
    const user = c.get('user');
    const formData = await c.req.formData();
    const file = formData.get('file');

    if (!file || typeof file === 'string') {
      return errors.badRequest(c, 'File is required');
    }

    if (!('type' in file) || !file.type || !file.type.startsWith('image/')) {
      return errors.badRequest(c, 'Avatar must be an image file');
    }

    const uploaded = await fileService.upload(
      file as unknown as { name: string; type: string; size: number; arrayBuffer: () => Promise<ArrayBuffer> },
      user
    );

    const updated = await userRepository.update(user.id, { avatarUrl: uploaded.url });
    if (!updated) {
      return errors.notFound(c, 'User not found');
    }

    return success(c, { user: toPublicUser(updated) }, undefined, 201);
  } catch (error) {
    if (error instanceof Error) {
      return errors.badRequest(c, error.message);
    }
    console.error('Error uploading avatar:', error);
    return errors.internal(c, 'Failed to upload avatar');
  }
});

// DELETE /api/v1/profile/avatar - Remove avatar image
profile.delete('/avatar', async (c) => {
  try {
    const user = c.get('user');
    const updated = await userRepository.update(user.id, { avatarUrl: null });
    if (!updated) {
      return errors.notFound(c, 'User not found');
    }

    return success(c, { user: toPublicUser(updated) });
  } catch (error) {
    console.error('Error removing avatar:', error);
    return errors.internal(c, 'Failed to remove avatar');
  }
});

// POST /api/v1/profile/password - Change password
profile.post('/password', async (c) => {
  try {
    const body = await c.req.json();
    const validation = validateBody(changePasswordSchema, body);
    if (!validation.success) {
      return errors.validation(c, formatValidationErrors(validation.errors));
    }

    const { currentPassword, newPassword } = validation.data;
    const currentUser = c.get('user');

    const userRecord = await userRepository.findById(currentUser.id);
    if (!userRecord) {
      return errors.notFound(c, 'User not found');
    }

    const isValid = await verifyPassword(currentPassword, userRecord.passwordHash);
    if (!isValid) {
      return errors.badRequest(c, 'Current password is incorrect');
    }

    const passwordHash = await hashPassword(newPassword);
    await userRepository.update(currentUser.id, { passwordHash });

    return success(c, { changed: true });
  } catch (error) {
    console.error('Error updating password:', error);
    return errors.internal(c, 'Failed to update password');
  }
});

export { profile };

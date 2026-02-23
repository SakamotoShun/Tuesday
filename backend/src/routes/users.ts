import { Hono } from 'hono';
import { auth } from '../middleware';
import { userRepository } from '../repositories';
import { success, errors } from '../utils/response';

const users = new Hono();

users.use('*', auth);

// GET /api/v1/users/mentionable - List users available for mentions
users.get('/mentionable', async (c) => {
  try {
    const list = await userRepository.findAll();
    return success(c, list);
  } catch (error) {
    console.error('Error fetching mentionable users:', error);
    return errors.internal(c, 'Failed to fetch users');
  }
});

// PATCH /api/v1/users/me/onboarding - Mark onboarding as completed
users.patch('/me/onboarding', async (c) => {
  try {
    const currentUser = c.get('user');

    if (currentUser.onboardingCompletedAt) {
      return success(c, {
        completed: true,
        onboardingCompletedAt: currentUser.onboardingCompletedAt,
      });
    }

    const updated = await userRepository.update(currentUser.id, {
      onboardingCompletedAt: new Date(),
    });

    if (!updated) {
      return errors.notFound(c, 'User not found');
    }

    return success(c, {
      completed: true,
      onboardingCompletedAt: updated.onboardingCompletedAt,
    });
  } catch (error) {
    console.error('Error completing onboarding:', error);
    return errors.internal(c, 'Failed to complete onboarding');
  }
});

export { users };

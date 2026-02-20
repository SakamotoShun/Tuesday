import { Hono } from 'hono';
import { auth } from '../middleware';
import { favoriteService } from '../services';
import { errors, success } from '../utils/response';
import {
  createFavoriteSchema,
  favoriteEntityTypeSchema,
  formatValidationErrors,
  reorderFavoritesSchema,
  uuidSchema,
  validateBody,
} from '../utils/validation';

const favorites = new Hono();

favorites.use('*', auth);

// GET /api/v1/favorites - List favorites for current user
favorites.get('/', async (c) => {
  try {
    const user = c.get('user');
    const items = await favoriteService.listFavorites(user);
    return success(c, items);
  } catch (error) {
    console.error('Error fetching favorites:', error);
    return errors.internal(c, 'Failed to fetch favorites');
  }
});

// POST /api/v1/favorites - Add new favorite
favorites.post('/', async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json();
    const validation = validateBody(createFavoriteSchema, body);
    if (!validation.success) {
      return errors.validation(c, formatValidationErrors(validation.errors));
    }

    const item = await favoriteService.addFavorite(user, validation.data.entityType, validation.data.entityId);
    return success(c, item, undefined, 201);
  } catch (error) {
    if (error instanceof Error) {
      return errors.badRequest(c, error.message);
    }
    console.error('Error creating favorite:', error);
    return errors.internal(c, 'Failed to create favorite');
  }
});

// DELETE /api/v1/favorites/:entityType/:entityId - Remove favorite
favorites.delete('/:entityType/:entityId', async (c) => {
  try {
    const user = c.get('user');
    const entityTypeRaw = c.req.param('entityType');
    const entityIdRaw = c.req.param('entityId');

    const entityTypeValidation = favoriteEntityTypeSchema.safeParse(entityTypeRaw);
    if (!entityTypeValidation.success) {
      return errors.badRequest(c, 'Invalid favorite entity type');
    }

    const entityIdValidation = uuidSchema.safeParse(entityIdRaw);
    if (!entityIdValidation.success) {
      return errors.badRequest(c, 'Invalid entity ID');
    }

    const deleted = await favoriteService.removeFavorite(user.id, entityTypeValidation.data, entityIdValidation.data);
    if (!deleted) {
      return errors.notFound(c, 'Favorite not found');
    }

    return success(c, { deleted: true });
  } catch (error) {
    if (error instanceof Error) {
      return errors.badRequest(c, error.message);
    }
    console.error('Error deleting favorite:', error);
    return errors.internal(c, 'Failed to delete favorite');
  }
});

// POST /api/v1/favorites/reorder - Reorder favorites
favorites.post('/reorder', async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json();
    const validation = validateBody(reorderFavoritesSchema, body);
    if (!validation.success) {
      return errors.validation(c, formatValidationErrors(validation.errors));
    }

    await favoriteService.reorderFavorites(user.id, validation.data.favoriteIds);
    return success(c, { reordered: true });
  } catch (error) {
    if (error instanceof Error) {
      return errors.badRequest(c, error.message);
    }
    console.error('Error reordering favorites:', error);
    return errors.internal(c, 'Failed to reorder favorites');
  }
});

export { favorites };

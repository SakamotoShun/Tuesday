import { Hono } from 'hono';
import { auth, requireAdmin } from '../middleware';
import { channelRepository } from '../repositories/channel';
import { botService } from '../services/bot';
import { success, errors } from '../utils/response';
import { validateBody, formatValidationErrors, createBotSchema, updateBotSchema, addBotToChannelSchema } from '../utils/validation';

const bots = new Hono();

bots.use('*', auth, requireAdmin);

// GET /api/v1/admin/bots/channels - List available channels for bots
bots.get('/channels', async (c) => {
  try {
    const channels = await channelRepository.findAll();
    const filtered = channels.filter((channel) => channel.type !== 'dm');
    return success(c, filtered);
  } catch (error) {
    console.error('Error fetching bot channels:', error);
    return errors.internal(c, 'Failed to fetch channels');
  }
});

// GET /api/v1/admin/bots - List bots
bots.get('/', async (c) => {
  try {
    const result = await botService.listBots();
    return success(c, result);
  } catch (error) {
    console.error('Error fetching bots:', error);
    return errors.internal(c, 'Failed to fetch bots');
  }
});

// POST /api/v1/admin/bots - Create bot
bots.post('/', async (c) => {
  try {
    const body = await c.req.json();
    const validation = validateBody(createBotSchema, body);
    if (!validation.success) {
      return errors.validation(c, formatValidationErrors(validation.errors));
    }

    const user = c.get('user');
    const bot = await botService.createBot(validation.data, user);
    return success(c, bot, undefined, 201);
  } catch (error) {
    console.error('Error creating bot:', error);
    if (error instanceof Error) {
      return errors.badRequest(c, error.message);
    }
    return errors.internal(c, 'Failed to create bot');
  }
});

// GET /api/v1/admin/bots/:id - Get bot
bots.get('/:id', async (c) => {
  try {
    const botId = c.req.param('id');
    const bot = await botService.getBot(botId);
    if (!bot) {
      return errors.notFound(c, 'Bot not found');
    }
    return success(c, bot);
  } catch (error) {
    console.error('Error fetching bot:', error);
    return errors.internal(c, 'Failed to fetch bot');
  }
});

// PATCH /api/v1/admin/bots/:id - Update bot
bots.patch('/:id', async (c) => {
  try {
    const botId = c.req.param('id');
    const body = await c.req.json();
    const validation = validateBody(updateBotSchema, body);
    if (!validation.success) {
      return errors.validation(c, formatValidationErrors(validation.errors));
    }

    const updated = await botService.updateBot(botId, validation.data);
    if (!updated) {
      return errors.notFound(c, 'Bot not found');
    }

    return success(c, updated);
  } catch (error) {
    console.error('Error updating bot:', error);
    if (error instanceof Error) {
      return errors.badRequest(c, error.message);
    }
    return errors.internal(c, 'Failed to update bot');
  }
});

// DELETE /api/v1/admin/bots/:id - Delete bot
bots.delete('/:id', async (c) => {
  try {
    const botId = c.req.param('id');
    const deleted = await botService.deleteBot(botId);
    if (!deleted) {
      return errors.notFound(c, 'Bot not found');
    }
    return success(c, { deleted: true });
  } catch (error) {
    console.error('Error deleting bot:', error);
    return errors.internal(c, 'Failed to delete bot');
  }
});

// POST /api/v1/admin/bots/:id/regenerate-token - Regenerate webhook token
bots.post('/:id/regenerate-token', async (c) => {
  try {
    const botId = c.req.param('id');
    const updated = await botService.regenerateToken(botId);
    if (!updated) {
      return errors.notFound(c, 'Bot not found');
    }
    return success(c, updated);
  } catch (error) {
    console.error('Error regenerating bot token:', error);
    return errors.internal(c, 'Failed to regenerate token');
  }
});

// GET /api/v1/admin/bots/:id/channels - List bot channels
bots.get('/:id/channels', async (c) => {
  try {
    const botId = c.req.param('id');
    const bot = await botService.getBot(botId);
    if (!bot) {
      return errors.notFound(c, 'Bot not found');
    }
    const channels = await botService.listBotChannels(botId);
    return success(c, channels);
  } catch (error) {
    console.error('Error fetching bot channels:', error);
    return errors.internal(c, 'Failed to fetch bot channels');
  }
});

// POST /api/v1/admin/bots/:id/channels - Add bot to channel
bots.post('/:id/channels', async (c) => {
  try {
    const botId = c.req.param('id');
    const body = await c.req.json();
    const validation = validateBody(addBotToChannelSchema, body);
    if (!validation.success) {
      return errors.validation(c, formatValidationErrors(validation.errors));
    }
    const user = c.get('user');
    const membership = await botService.addBotToChannel(botId, validation.data.channelId, user);
    return success(c, membership, undefined, 201);
  } catch (error) {
    console.error('Error adding bot to channel:', error);
    if (error instanceof Error) {
      return errors.badRequest(c, error.message);
    }
    return errors.internal(c, 'Failed to add bot to channel');
  }
});

// DELETE /api/v1/admin/bots/:id/channels/:channelId - Remove bot from channel
bots.delete('/:id/channels/:channelId', async (c) => {
  try {
    const botId = c.req.param('id');
    const channelId = c.req.param('channelId');
    const removed = await botService.removeBotFromChannel(botId, channelId);
    if (!removed) {
      return errors.notFound(c, 'Bot channel membership not found');
    }
    return success(c, { removed: true });
  } catch (error) {
    console.error('Error removing bot from channel:', error);
    return errors.internal(c, 'Failed to remove bot from channel');
  }
});

export { bots };

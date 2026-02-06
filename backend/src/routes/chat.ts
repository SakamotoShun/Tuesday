import { Hono } from 'hono';
import { auth } from '../middleware';
import { chatService } from '../services';
import { botService } from '../services/bot';
import { success, errors } from '../utils/response';
import { validateBody, formatValidationErrors, createChannelSchema, createMessageSchema, updateChannelSchema, updateMessageSchema, addReactionSchema, addChannelMembersSchema } from '../utils/validation';

const chat = new Hono();

chat.use('*', auth);

// GET /api/v1/channels - List channels accessible to user
chat.get('/', async (c) => {
  try {
    const user = c.get('user');
    const channels = await chatService.getChannels(user);
    return success(c, channels);
  } catch (error) {
    console.error('Error fetching channels:', error);
    return errors.internal(c, 'Failed to fetch channels');
  }
});

// POST /api/v1/channels - Create channel
chat.post('/', async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json();

    const validation = validateBody(createChannelSchema, body);
    if (!validation.success) {
      return errors.validation(c, formatValidationErrors(validation.errors));
    }

    const channel = await chatService.createChannel(validation.data, user);
    return success(c, channel, undefined, 201);
  } catch (error) {
    if (error instanceof Error) {
      return errors.badRequest(c, error.message);
    }
    console.error('Error creating channel:', error);
    return errors.internal(c, 'Failed to create channel');
  }
});

// PATCH /api/v1/channels/:id - Update channel
chat.patch('/:id', async (c) => {
  try {
    const user = c.get('user');
    const channelId = c.req.param('id');
    const body = await c.req.json();

    const validation = validateBody(updateChannelSchema, body);
    if (!validation.success) {
      return errors.validation(c, formatValidationErrors(validation.errors));
    }

    const channel = await chatService.updateChannel(channelId, validation.data, user);
    return success(c, channel);
  } catch (error) {
    if (error instanceof Error) {
      return errors.badRequest(c, error.message);
    }
    console.error('Error updating channel:', error);
    return errors.internal(c, 'Failed to update channel');
  }
});

// GET /api/v1/channels/:id/members - List channel members
chat.get('/:id/members', async (c) => {
  try {
    const user = c.get('user');
    const channelId = c.req.param('id');
    const members = await chatService.getChannelMembers(channelId, user);
    return success(c, members);
  } catch (error) {
    if (error instanceof Error) {
      return errors.badRequest(c, error.message);
    }
    console.error('Error fetching channel members:', error);
    return errors.internal(c, 'Failed to fetch channel members');
  }
});

// POST /api/v1/channels/:id/members - Add channel members
chat.post('/:id/members', async (c) => {
  try {
    const user = c.get('user');
    const channelId = c.req.param('id');
    const body = await c.req.json();

    const validation = validateBody(addChannelMembersSchema, body);
    if (!validation.success) {
      return errors.validation(c, formatValidationErrors(validation.errors));
    }

    const members = await chatService.addChannelMembers(channelId, validation.data.userIds, user);
    return success(c, members);
  } catch (error) {
    if (error instanceof Error) {
      return errors.badRequest(c, error.message);
    }
    console.error('Error adding channel members:', error);
    return errors.internal(c, 'Failed to add channel members');
  }
});

// DELETE /api/v1/channels/:id/members/:userId - Remove channel member (or leave)
chat.delete('/:id/members/:userId', async (c) => {
  try {
    const user = c.get('user');
    const channelId = c.req.param('id');
    const memberId = c.req.param('userId');

    const members = await chatService.removeChannelMember(channelId, memberId, user);
    return success(c, members);
  } catch (error) {
    if (error instanceof Error) {
      return errors.badRequest(c, error.message);
    }
    console.error('Error removing channel member:', error);
    return errors.internal(c, 'Failed to remove channel member');
  }
});

// DELETE /api/v1/channels/:id - Archive channel (soft delete)
chat.delete('/:id', async (c) => {
  try {
    const user = c.get('user');
    const channelId = c.req.param('id');
    const channel = await chatService.archiveChannel(channelId, user);
    return success(c, channel);
  } catch (error) {
    if (error instanceof Error) {
      return errors.badRequest(c, error.message);
    }
    console.error('Error archiving channel:', error);
    return errors.internal(c, 'Failed to archive channel');
  }
});

// DELETE /api/v1/channels/:id/permanent - Permanently delete channel
// This is a destructive action that deletes the channel and all its messages/files
chat.delete('/:id/permanent', async (c) => {
  try {
    const user = c.get('user');
    const channelId = c.req.param('id');
    await chatService.deleteChannel(channelId, user);
    return success(c, { deleted: true });
  } catch (error) {
    if (error instanceof Error) {
      return errors.badRequest(c, error.message);
    }
    console.error('Error deleting channel:', error);
    return errors.internal(c, 'Failed to delete channel');
  }
});

// GET /api/v1/channels/:id/messages - List messages
chat.get('/:id/messages', async (c) => {
  try {
    const user = c.get('user');
    const channelId = c.req.param('id');
    const before = c.req.query('before');
    const limit = c.req.query('limit');

    const parsedLimit = limit ? Number(limit) : undefined;
    const safeLimit = parsedLimit && Number.isFinite(parsedLimit) ? parsedLimit : undefined;
    const parsedBefore = before ? new Date(before) : undefined;
    const safeBefore = parsedBefore && !Number.isNaN(parsedBefore.getTime()) ? parsedBefore : undefined;

    const messages = await chatService.getMessages(channelId, user, {
      before: safeBefore,
      limit: safeLimit,
    });

    const nextCursor = messages.length > 0 ? messages[messages.length - 1].createdAt.toISOString() : null;

    return success(c, messages, { nextCursor });
  } catch (error) {
    if (error instanceof Error) {
      return errors.badRequest(c, error.message);
    }
    console.error('Error fetching messages:', error);
    return errors.internal(c, 'Failed to fetch messages');
  }
});

// POST /api/v1/channels/:id/messages - Send message
chat.post('/:id/messages', async (c) => {
  try {
    const user = c.get('user');
    const channelId = c.req.param('id');
    const body = await c.req.json();

    const validation = validateBody(createMessageSchema, body);
    if (!validation.success) {
      return errors.validation(c, formatValidationErrors(validation.errors));
    }

    const message = await chatService.sendMessage(channelId, validation.data, user);
    return success(c, message, undefined, 201);
  } catch (error) {
    if (error instanceof Error) {
      return errors.badRequest(c, error.message);
    }
    console.error('Error sending message:', error);
    return errors.internal(c, 'Failed to send message');
  }
});

// POST /api/v1/channels/:channelId/messages/:messageId/reactions - Add reaction
chat.post('/:channelId/messages/:messageId/reactions', async (c) => {
  try {
    const user = c.get('user');
    const channelId = c.req.param('channelId');
    const messageId = c.req.param('messageId');
    const body = await c.req.json();

    const validation = validateBody(addReactionSchema, body);
    if (!validation.success) {
      return errors.validation(c, formatValidationErrors(validation.errors));
    }

    const message = await chatService.addReaction(channelId, messageId, validation.data.emoji, user);
    return success(c, message);
  } catch (error) {
    if (error instanceof Error) {
      return errors.badRequest(c, error.message);
    }
    console.error('Error adding reaction:', error);
    return errors.internal(c, 'Failed to add reaction');
  }
});

// DELETE /api/v1/channels/:channelId/messages/:messageId/reactions/:emoji - Remove reaction
chat.delete('/:channelId/messages/:messageId/reactions/:emoji', async (c) => {
  try {
    const user = c.get('user');
    const channelId = c.req.param('channelId');
    const messageId = c.req.param('messageId');
    const emojiParam = c.req.param('emoji');
    const emoji = decodeURIComponent(emojiParam);

    const message = await chatService.removeReaction(channelId, messageId, emoji, user);
    return success(c, message);
  } catch (error) {
    if (error instanceof Error) {
      return errors.badRequest(c, error.message);
    }
    console.error('Error removing reaction:', error);
    return errors.internal(c, 'Failed to remove reaction');
  }
});

// PATCH /api/v1/channels/:channelId/messages/:messageId - Update message
chat.patch('/:channelId/messages/:messageId', async (c) => {
  try {
    const user = c.get('user');
    const channelId = c.req.param('channelId');
    const messageId = c.req.param('messageId');
    const body = await c.req.json();

    const validation = validateBody(updateMessageSchema, body);
    if (!validation.success) {
      return errors.validation(c, formatValidationErrors(validation.errors));
    }

    const message = await chatService.updateMessage(channelId, messageId, validation.data, user);
    return success(c, message);
  } catch (error) {
    if (error instanceof Error) {
      return errors.badRequest(c, error.message);
    }
    console.error('Error updating message:', error);
    return errors.internal(c, 'Failed to update message');
  }
});

// DELETE /api/v1/channels/:channelId/messages/:messageId - Delete message
chat.delete('/:channelId/messages/:messageId', async (c) => {
  try {
    const user = c.get('user');
    const channelId = c.req.param('channelId');
    const messageId = c.req.param('messageId');
    const message = await chatService.deleteMessage(channelId, messageId, user);
    return success(c, message);
  } catch (error) {
    if (error instanceof Error) {
      return errors.badRequest(c, error.message);
    }
    console.error('Error deleting message:', error);
    return errors.internal(c, 'Failed to delete message');
  }
});

// GET /api/v1/channels/:id/bots - List bots in channel
chat.get('/:id/bots', async (c) => {
  try {
    const user = c.get('user');
    const channelId = c.req.param('id');

    // Verify user has access to the channel
    const channel = await chatService.getChannel(channelId, user);
    if (!channel) {
      return errors.notFound(c, 'Channel not found');
    }

    const bots = await botService.getChannelBots(channelId);
    // Return only non-disabled bots with minimal data needed for mentions
    const activeBots = bots
      .filter((bot) => !bot.isDisabled)
      .map((bot) => ({
        id: bot.id,
        name: bot.name,
        avatarUrl: bot.avatarUrl,
        type: bot.type,
      }));
    return success(c, activeBots);
  } catch (error) {
    if (error instanceof Error) {
      return errors.badRequest(c, error.message);
    }
    console.error('Error fetching channel bots:', error);
    return errors.internal(c, 'Failed to fetch channel bots');
  }
});

// PATCH /api/v1/channels/:id/read - Mark channel as read
chat.patch('/:id/read', async (c) => {
  try {
    const user = c.get('user');
    const channelId = c.req.param('id');
    await chatService.markAsRead(channelId, user);
    return success(c, { read: true });
  } catch (error) {
    if (error instanceof Error) {
      return errors.badRequest(c, error.message);
    }
    console.error('Error marking channel as read:', error);
    return errors.internal(c, 'Failed to mark channel as read');
  }
});

export { chat };

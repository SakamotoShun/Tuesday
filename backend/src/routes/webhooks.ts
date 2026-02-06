import { Hono } from 'hono';
import { webhookRateLimit } from '../middleware';
import { botService } from '../services/bot';
import { success, errors } from '../utils/response';
import { validateBody, formatValidationErrors, webhookMessageSchema } from '../utils/validation';

const webhooks = new Hono();

// POST /api/v1/webhooks/:botId/:token/channels/:channelId - Post a bot message
webhooks.post('/:botId/:token/channels/:channelId', webhookRateLimit, async (c) => {
  try {
    const botId = c.req.param('botId');
    const token = c.req.param('token');
    const channelId = c.req.param('channelId');
    const body = await c.req.json();

    const validation = validateBody(webhookMessageSchema, body);
    if (!validation.success) {
      return errors.validation(c, formatValidationErrors(validation.errors));
    }

    const message = await botService.postWebhookMessage({
      botId,
      token,
      channelId,
      content: validation.data.content,
    });

    return success(c, message, undefined, 201);
  } catch (error) {
    if (error instanceof Error) {
      switch (error.message) {
        case 'Bot not found':
          return errors.notFound(c, 'Bot not found');
        case 'Invalid webhook token':
          return errors.unauthorized(c, 'Invalid webhook token');
        case 'Bot is disabled':
          return errors.forbidden(c, 'Bot is disabled');
        case 'Channel not found':
          return errors.notFound(c, 'Channel not found');
        case 'Bots cannot post to DM channels':
          return errors.badRequest(c, error.message);
        case 'Bot is not a member of this channel':
          return errors.forbidden(c, error.message);
        case 'Message content is required':
          return errors.validation(c, [{ field: 'content', message: error.message }]);
        default:
          return errors.badRequest(c, error.message);
      }
    }
    console.error('Error processing webhook:', error);
    return errors.internal(c, 'Failed to process webhook');
  }
});

export { webhooks };

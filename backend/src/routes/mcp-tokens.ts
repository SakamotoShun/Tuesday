import { Hono } from 'hono';
import { mcpTokenService } from '../services/mcpToken';
import { auth } from '../middleware';
import { success, errors } from '../utils/response';
import { validateBody, formatValidationErrors, createMcpTokenSchema } from '../utils/validation';
import type { User } from '../types';

const mcpTokens = new Hono();

// All routes require authentication
mcpTokens.use('*', auth);

// GET /api/v1/mcp-tokens - List user's tokens
mcpTokens.get('/', async (c) => {
  try {
    const user = c.get('user');
    const tokens = await mcpTokenService.listTokens(user.id);
    return success(c, tokens);
  } catch (error) {
    console.error('Error listing MCP tokens:', error);
    return errors.internal(c, 'Failed to list tokens');
  }
});

// POST /api/v1/mcp-tokens - Create a new token
mcpTokens.post('/', async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json();

    const validation = validateBody(createMcpTokenSchema, body);
    if (!validation.success) {
      return errors.validation(c, formatValidationErrors(validation.errors));
    }

    try {
      const result = await mcpTokenService.createToken(
        user.id,
        validation.data.name,
        validation.data.scopes,
        validation.data.expiresAt
      );
      return success(c, result, undefined, 201);
    } catch (error) {
      if (error instanceof Error) {
        return errors.badRequest(c, error.message);
      }
      throw error;
    }
  } catch (error) {
    console.error('Error creating MCP token:', error);
    return errors.internal(c, 'Failed to create token');
  }
});

// DELETE /api/v1/mcp-tokens/:id - Revoke a token
mcpTokens.delete('/:id', async (c) => {
  try {
    const user = c.get('user');
    const tokenId = c.req.param('id');

    const revoked = await mcpTokenService.revokeToken(tokenId, user.id);
    if (!revoked) {
      return errors.notFound(c, 'Token not found');
    }

    return success(c, { revoked: true });
  } catch (error) {
    console.error('Error revoking MCP token:', error);
    return errors.internal(c, 'Failed to revoke token');
  }
});

export { mcpTokens };
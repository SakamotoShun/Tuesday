import { registerTool } from './tools';
import type { TuesdayMcpTool, McpContext } from './types';

// ============ ping ============

registerTool({
  name: 'ping',
  description: 'Test connectivity. Returns pong with server info.',
  requiredScope: 'search:read',
  inputSchema: {
    type: 'object',
    properties: {},
    additionalProperties: false,
  },
  handler: async (_input: unknown, ctx: McpContext) => {
    return {
      message: 'pong',
      user: ctx.user.name,
      role: ctx.user.role,
      scopes: Array.from(ctx.token.scopes),
    };
  },
});
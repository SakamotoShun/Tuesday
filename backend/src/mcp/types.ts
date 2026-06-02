import type { AuthenticatedMcpUser } from '../services/mcpToken';
import type { User } from '../types';

export interface McpContext {
  user: User;
  token: AuthenticatedMcpUser;
}

export interface TuesdayMcpTool {
  name: string;
  description: string;
  requiredScope: string;
  inputSchema: Record<string, unknown>;
  handler: (input: unknown, ctx: McpContext) => Promise<unknown>;
}
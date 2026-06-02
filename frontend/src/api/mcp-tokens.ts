import { api } from './client';
import type { McpTokenListItem, CreateMcpTokenInput, CreatedMcpToken } from './types';

export const mcpTokensApi = {
  list: (): Promise<McpTokenListItem[]> => api.get('/mcp-tokens'),
  create: (input: CreateMcpTokenInput): Promise<CreatedMcpToken> => api.post('/mcp-tokens', input),
  revoke: (tokenId: string): Promise<void> => api.delete(`/mcp-tokens/${tokenId}`),
};
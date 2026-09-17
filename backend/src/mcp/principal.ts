import type { AuthenticatedMcpUser } from '../services/mcpToken';
import { McpToolError } from './errors';

/** Stable credential identity shared by receipts and document references. */
export function principalFor(token: AuthenticatedMcpUser) {
  if (token.authType === 'oauth') {
    if (!token.clientId) throw new McpToolError('INTERNAL_ERROR', 'OAuth credential identity is incomplete.');
    return { type: 'oauth' as const, id: `${token.userId}:${token.clientId}`, tokenId: null, userId: token.userId };
  }
  return { type: 'pat' as const, id: token.tokenId, tokenId: token.tokenId, userId: null };
}

import { mcpTokenService, type AuthenticatedMcpUser } from '../services/mcpToken';
import { oauthService } from '../services/oauth';
import { userRepository } from '../repositories/user';
import type { User } from '../types';

/**
 * Extract a Bearer token from the Authorization header.
 * Returns null if missing, malformed, or empty.
 */
export function extractBearerToken(request: Request): string | null {
  const header = request.headers.get('Authorization');
  if (!header) return null;

  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  const token = match[1].trim();
  if (!token) return null;

  return token;
}

/**
 * Authenticate an MCP request using a Bearer token.
 * Returns the actual DB user + token info if valid, null otherwise.
 */
export async function authenticateMcpRequest(
  request: Request
): Promise<{ user: User; token: AuthenticatedMcpUser } | null> {
  const rawToken = extractBearerToken(request);
  if (!rawToken) return null;

  const result = await mcpTokenService.authenticateToken(rawToken);
  const authResult = result ?? await oauthService.authenticateAccessToken(rawToken);
  if (!authResult) return null;

  const user = await userRepository.findById(authResult.userId);
  if (!user || user.isDisabled) return null;

  return { user: user as User, token: authResult };
}

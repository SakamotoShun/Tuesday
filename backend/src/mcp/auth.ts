import { mcpTokenService, type AuthenticatedMcpUser } from '../services/mcpToken';
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
 * Returns user + token info if valid, null otherwise.
 */
export async function authenticateMcpRequest(
  request: Request
): Promise<{ user: User; token: AuthenticatedMcpUser } | null> {
  const rawToken = extractBearerToken(request);
  if (!rawToken) return null;

  const result = await mcpTokenService.authenticateToken(rawToken);
  if (!result) return null;

  // Build a minimal User object compatible with the existing User type
  const user: User = {
    id: result.userId,
    email: result.userEmail,
    name: result.userName,
    role: result.userRole as User['role'],
    avatarUrl: null,
    employmentType: 'full_time',
    hourlyRate: null,
    isDisabled: false,
    onboardingCompletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  return { user, token: result };
}
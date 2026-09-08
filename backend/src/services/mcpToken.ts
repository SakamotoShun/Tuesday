import { mcpTokenRepository } from '../repositories/mcpToken';
import { generateMcpToken, hashMcpToken } from '../utils/mcp-token';

export type McpScope =
  | 'projects:read'
  | 'tasks:read'
  | 'tasks:write'
  | 'docs:read'
  | 'docs:write'
  | 'meetings:read'
  | 'meetings:write'
  | 'time:read'
  | 'time:write'
  | 'search:read';

export const VALID_MCP_SCOPES: ReadonlySet<McpScope> = new Set<McpScope>([
  'projects:read',
  'tasks:read',
  'tasks:write',
  'docs:read',
  'docs:write',
  'meetings:read',
  'meetings:write',
  'time:read',
  'time:write',
  'search:read',
]);

const READ_SCOPE_BY_WRITE_SCOPE: Partial<Record<McpScope, McpScope>> = {
  'tasks:write': 'tasks:read',
  'docs:write': 'docs:read',
  'meetings:write': 'meetings:read',
  'time:write': 'time:read',
};

export function expandMcpScopes(scopes: Iterable<McpScope>): McpScope[] {
  const expanded = new Set<McpScope>();
  for (const scope of scopes) {
    expanded.add(scope);
    const readScope = READ_SCOPE_BY_WRITE_SCOPE[scope];
    if (readScope) expanded.add(readScope);
  }
  return Array.from(expanded);
}

export interface CreateTokenResult {
  token: {
    id: string;
    name: string;
    scopes: string[];
    expiresAt: string | null;
    createdAt: string;
  };
  rawToken: string;
}

export interface TokenListItem {
  id: string;
  name: string;
  scopes: string[];
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface AuthenticatedMcpUser {
  userId: string;
  userName: string;
  userEmail: string;
  userRole: string;
  tokenId: string;
  scopes: Set<string>;
  authType?: 'pat' | 'oauth';
  clientId?: string;
}

export class McpTokenService {
  /**
   * Create a new MCP token. Returns the raw token once.
   */
  async createToken(
    userId: string,
    name: string,
    scopes: string[],
    expiresAt?: string | null
  ): Promise<CreateTokenResult> {
    if (!name || name.trim() === '') {
      throw new Error('Token name is required');
    }

    const invalidScopes = scopes.filter((s) => !VALID_MCP_SCOPES.has(s as McpScope));
    if (invalidScopes.length > 0) {
      throw new Error(`Invalid scopes: ${invalidScopes.join(', ')}`);
    }

    const parsedExpiresAt = expiresAt ? new Date(expiresAt) : null;
    if (parsedExpiresAt && Number.isNaN(parsedExpiresAt.getTime())) {
      throw new Error('Invalid expiration date');
    }

    const expandedScopes = expandMcpScopes(scopes as McpScope[]);
    const rawToken = generateMcpToken();
    const tokenHash = hashMcpToken(rawToken);

    const created = await mcpTokenRepository.create({
      userId,
      name: name.trim(),
      tokenHash,
      scopes: expandedScopes as any,
      expiresAt: parsedExpiresAt,
    });

    return {
      token: {
        id: created.id,
        name: created.name,
        scopes: (created.scopes as string[]),
        expiresAt: created.expiresAt?.toISOString() ?? null,
        createdAt: created.createdAt.toISOString(),
      },
      rawToken,
    };
  }

  /**
   * List the current user's tokens (no hashes, no raw tokens).
   */
  async listTokens(userId: string): Promise<TokenListItem[]> {
    const tokens = await mcpTokenRepository.findByUserId(userId);
    return tokens.map((t) => ({
      id: t.id,
      name: t.name,
      scopes: (t.scopes as string[]),
      lastUsedAt: t.lastUsedAt?.toISOString() ?? null,
      expiresAt: t.expiresAt?.toISOString() ?? null,
      revokedAt: t.revokedAt?.toISOString() ?? null,
      createdAt: t.createdAt.toISOString(),
    }));
  }

  /**
   * Revoke a user's MCP token.
   */
  async revokeToken(tokenId: string, userId: string): Promise<boolean> {
    return mcpTokenRepository.revoke(tokenId, userId);
  }

  /**
   * Authenticate a raw bearer token.
   * Returns user info + token scopes if valid.
   * Returns null if invalid, expired, or revoked.
   */
  async authenticateToken(rawToken: string): Promise<AuthenticatedMcpUser | null> {
    if (!rawToken) return null;

    const tokenHash = hashMcpToken(rawToken);
    const token = await mcpTokenRepository.findByHash(tokenHash);

    if (!token || !token.user) return null;

    // Check expired
    if (token.expiresAt && new Date() > token.expiresAt) return null;

    // Mark last used (don't block on this)
    mcpTokenRepository.markUsed(token.id).catch(() => {});

    return {
      userId: token.user.id,
      userName: token.user.name,
      userEmail: token.user.email,
      userRole: token.user.role,
      tokenId: token.id,
      scopes: new Set(expandMcpScopes(token.scopes as McpScope[])),
      authType: 'pat',
    };
  }
}

export const mcpTokenService = new McpTokenService();

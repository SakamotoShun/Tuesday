import { oauthRepository } from '../repositories/oauth';
import { VALID_MCP_SCOPES, type McpScope, type AuthenticatedMcpUser } from './mcpToken';
import {
  fingerprintOauthToken,
  generateOauthAccessToken,
  generateOauthAuthorizationCode,
  generateOauthClientId,
  generateOauthClientSecret,
  generateOauthRefreshToken,
  verifyPkceS256,
} from '../utils/oauth';
import { hashPassword, verifyPassword } from '../utils/password';

const AUTH_CODE_TTL_MS = 5 * 60 * 1000;
const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const DEFAULT_SCOPES: McpScope[] = ['projects:read', 'tasks:read', 'docs:read', 'search:read'];

interface RegisterClientInput {
  client_name?: string;
  redirect_uris?: string[];
  grant_types?: string[];
  response_types?: string[];
  scope?: string;
  client_uri?: string;
  logo_uri?: string;
  token_endpoint_auth_method?: string;
}

interface AuthorizeInput {
  responseType: string;
  clientId: string;
  redirectUri: string;
  scope?: string;
  state?: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  resource?: string;
}

interface TokenInput {
  grantType: string;
  code?: string;
  redirectUri?: string;
  clientId: string;
  clientSecret?: string | null;
  codeVerifier?: string;
  refreshToken?: string;
}

interface RevokeTokenInput {
  token: string;
  tokenTypeHint?: string;
  clientId: string;
  clientSecret?: string | null;
}

function parseScopes(scope?: string | null): string[] {
  if (!scope?.trim()) return [...DEFAULT_SCOPES];
  return Array.from(new Set(scope.split(/\s+/).map((s) => s.trim()).filter(Boolean)));
}

function validateScopes(scopes: string[]): McpScope[] {
  const invalid = scopes.filter((scope) => !VALID_MCP_SCOPES.has(scope as McpScope));
  if (invalid.length > 0) {
    throw new Error(`Invalid scopes: ${invalid.join(', ')}`);
  }
  return scopes as McpScope[];
}

function isHttpsOrLocalhostUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol === 'https:') return true;
    if (url.protocol === 'http:' && ['localhost', '127.0.0.1', '::1'].includes(url.hostname)) return true;
    return false;
  } catch {
    return false;
  }
}

function getIssuer(publicBaseUrl: string): string {
  return publicBaseUrl.replace(/\/+$/, '');
}

export class OauthService {
  private async validateClientCredentials(clientId: string, clientSecret?: string | null) {
    const client = await oauthRepository.findClient(clientId);
    if (!client) throw new Error('Invalid client');

    if (client.clientSecretHash) {
      const validSecret = await verifyPassword(clientSecret ?? '', client.clientSecretHash);
      if (!validSecret) {
        throw new Error('Invalid client');
      }
    }

    return client;
  }

  getAuthorizationServerMetadata(publicBaseUrl: string) {
    const issuer = getIssuer(publicBaseUrl);
    return {
      issuer,
      authorization_endpoint: `${issuer}/oauth/authorize`,
      token_endpoint: `${issuer}/oauth/token`,
      registration_endpoint: `${issuer}/oauth/register`,
      revocation_endpoint: `${issuer}/oauth/revoke`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
      scopes_supported: Array.from(VALID_MCP_SCOPES),
      protected_resources: [`${issuer}/api/mcp`],
    };
  }

  getProtectedResourceMetadata(publicBaseUrl: string) {
    const issuer = getIssuer(publicBaseUrl);
    return {
      resource: `${issuer}/api/mcp`,
      authorization_servers: [issuer],
      bearer_methods_supported: ['header'],
      scopes_supported: Array.from(VALID_MCP_SCOPES),
      resource_name: 'Tuesday MCP',
    };
  }

  async registerClient(input: RegisterClientInput) {
    const redirectUris = input.redirect_uris ?? [];
    if (redirectUris.length === 0) {
      throw new Error('redirect_uris is required');
    }
    if (redirectUris.some((uri) => !isHttpsOrLocalhostUrl(uri))) {
      throw new Error('redirect_uris must be HTTPS or localhost HTTP URLs');
    }

    const grantTypes = input.grant_types?.length ? input.grant_types : ['authorization_code'];
    const responseTypes = input.response_types?.length ? input.response_types : ['code'];
    if (grantTypes.some((type) => !['authorization_code', 'refresh_token'].includes(type)) || responseTypes.some((type) => type !== 'code')) {
      throw new Error('Only authorization_code, refresh_token, and code clients are supported');
    }

    const scopes = validateScopes(parseScopes(input.scope));
    const authMethod = input.token_endpoint_auth_method ?? 'none';
    if (!['none', 'client_secret_post', 'client_secret_basic'].includes(authMethod)) {
      throw new Error('Unsupported token_endpoint_auth_method');
    }

    const clientId = generateOauthClientId();
    const clientSecret = authMethod === 'none' ? null : generateOauthClientSecret();
    const client = await oauthRepository.createClient({
      clientId,
      clientSecretHash: clientSecret ? await hashPassword(clientSecret) : null,
      clientName: input.client_name?.trim() || 'MCP Client',
      redirectUris: redirectUris as any,
      grantTypes: grantTypes as any,
      responseTypes: responseTypes as any,
      scopes: scopes as any,
      clientUri: input.client_uri ?? null,
      logoUri: input.logo_uri ?? null,
    });

    return {
      client_id: client.clientId,
      client_secret: clientSecret ?? undefined,
      client_name: client.clientName,
      redirect_uris: client.redirectUris,
      grant_types: client.grantTypes,
      response_types: client.responseTypes,
      scope: (client.scopes as string[]).join(' '),
      token_endpoint_auth_method: authMethod,
    };
  }

  async getAuthorizeDetails(input: AuthorizeInput) {
    const client = await oauthRepository.findClient(input.clientId);
    if (!client) throw new Error('Unknown OAuth client');
    if (input.responseType !== 'code') throw new Error('Unsupported response_type');
    if (input.codeChallengeMethod !== 'S256') throw new Error('code_challenge_method must be S256');
    if (!input.codeChallenge) throw new Error('code_challenge is required');

    const redirectUris = client.redirectUris as string[];
    if (!redirectUris.includes(input.redirectUri)) {
      throw new Error('redirect_uri is not registered for this client');
    }

    const requestedScopes = validateScopes(parseScopes(input.scope));
    const allowedScopes = new Set(client.scopes as string[]);
    const unauthorized = requestedScopes.filter((scope) => !allowedScopes.has(scope));
    if (unauthorized.length > 0) {
      throw new Error(`Client is not allowed to request scopes: ${unauthorized.join(', ')}`);
    }

    return {
      client,
      scopes: requestedScopes,
    };
  }

  async approveAuthorization(input: AuthorizeInput, userId: string) {
    const details = await this.getAuthorizeDetails(input);
    await oauthRepository.upsertConsent({
      userId,
      clientId: input.clientId,
      scopes: details.scopes as any,
    });

    const rawCode = generateOauthAuthorizationCode();
    await oauthRepository.createAuthorizationCode({
      codeHash: fingerprintOauthToken(rawCode),
      clientId: input.clientId,
      userId,
      redirectUri: input.redirectUri,
      scopes: details.scopes as any,
      codeChallenge: input.codeChallenge,
      codeChallengeMethod: input.codeChallengeMethod,
      resource: input.resource ?? null,
      expiresAt: new Date(Date.now() + AUTH_CODE_TTL_MS),
    });

    const redirect = new URL(input.redirectUri);
    redirect.searchParams.set('code', rawCode);
    if (input.state) redirect.searchParams.set('state', input.state);
    return redirect.toString();
  }

  async exchangeAuthorizationCode(input: TokenInput) {
    if (input.grantType !== 'authorization_code') {
      throw new Error('Unsupported grant_type');
    }

    await this.validateClientCredentials(input.clientId, input.clientSecret);

    const code = await oauthRepository.findActiveAuthorizationCode(fingerprintOauthToken(input.code ?? ''));
    if (!code) throw new Error('Invalid or expired authorization code');
    if (code.clientId !== input.clientId || code.redirectUri !== input.redirectUri) {
      throw new Error('Invalid authorization code');
    }
    if (code.codeChallengeMethod !== 'S256' || !verifyPkceS256(input.codeVerifier ?? '', code.codeChallenge)) {
      throw new Error('Invalid PKCE verifier');
    }

    const consumed = await oauthRepository.markAuthorizationCodeUsed(code.id);
    if (!consumed) throw new Error('Invalid or expired authorization code');

    const rawAccessToken = generateOauthAccessToken();
    const rawRefreshToken = generateOauthRefreshToken();
    const accessExpiresAt = new Date(Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000);

    await oauthRepository.createAccessToken({
      tokenHash: fingerprintOauthToken(rawAccessToken),
      clientId: code.clientId,
      userId: code.userId,
      scopes: code.scopes,
      resource: code.resource,
      expiresAt: accessExpiresAt,
    });

    await oauthRepository.createRefreshToken({
      tokenHash: fingerprintOauthToken(rawRefreshToken),
      clientId: code.clientId,
      userId: code.userId,
      scopes: code.scopes,
      resource: code.resource,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    });

    return {
      access_token: rawAccessToken,
      token_type: 'Bearer',
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
      refresh_token: rawRefreshToken,
      scope: (code.scopes as string[]).join(' '),
    };
  }

  async refreshAccessToken(input: TokenInput) {
    if (input.grantType !== 'refresh_token') {
      throw new Error('Unsupported grant_type');
    }

    await this.validateClientCredentials(input.clientId, input.clientSecret);

    const refreshToken = await oauthRepository.findActiveRefreshToken(fingerprintOauthToken(input.refreshToken ?? ''));
    if (!refreshToken || refreshToken.clientId !== input.clientId || refreshToken.user?.isDisabled) {
      throw new Error('Invalid refresh token');
    }

    const revoked = await oauthRepository.revokeRefreshToken(refreshToken.id);
    if (!revoked) throw new Error('Invalid refresh token');

    const rawAccessToken = generateOauthAccessToken();
    const rawRefreshToken = generateOauthRefreshToken();

    await oauthRepository.createAccessToken({
      tokenHash: fingerprintOauthToken(rawAccessToken),
      clientId: refreshToken.clientId,
      userId: refreshToken.userId,
      scopes: refreshToken.scopes,
      resource: refreshToken.resource,
      expiresAt: new Date(Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000),
    });

    await oauthRepository.createRefreshToken({
      tokenHash: fingerprintOauthToken(rawRefreshToken),
      clientId: refreshToken.clientId,
      userId: refreshToken.userId,
      scopes: refreshToken.scopes,
      resource: refreshToken.resource,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      rotatedFromId: refreshToken.id,
    });

    return {
      access_token: rawAccessToken,
      token_type: 'Bearer',
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
      refresh_token: rawRefreshToken,
      scope: (refreshToken.scopes as string[]).join(' '),
    };
  }

  async authenticateAccessToken(rawToken: string): Promise<AuthenticatedMcpUser | null> {
    const token = await oauthRepository.findActiveAccessToken(fingerprintOauthToken(rawToken));
    if (!token || !token.user || token.user.isDisabled) return null;

    oauthRepository.markAccessTokenUsed(token.id).catch(() => {});

    return {
      userId: token.user.id,
      userName: token.user.name,
      userEmail: token.user.email,
      userRole: token.user.role,
      tokenId: token.id,
      scopes: new Set(token.scopes as string[]),
      authType: 'oauth',
      clientId: token.clientId,
    };
  }

  async revokeToken(input: RevokeTokenInput): Promise<void> {
    if (!input.token) {
      throw new Error('token is required');
    }

    await this.validateClientCredentials(input.clientId, input.clientSecret);

    const tokenHash = fingerprintOauthToken(input.token);
    if (input.tokenTypeHint === 'access_token') {
      await oauthRepository.revokeAccessTokenByHash(tokenHash, input.clientId);
      return;
    }
    if (input.tokenTypeHint === 'refresh_token') {
      await oauthRepository.revokeRefreshTokenByHash(tokenHash, input.clientId);
      return;
    }

    const accessRevoked = await oauthRepository.revokeAccessTokenByHash(tokenHash, input.clientId);
    if (!accessRevoked) {
      await oauthRepository.revokeRefreshTokenByHash(tokenHash, input.clientId);
    }
  }
}

export const oauthService = new OauthService();

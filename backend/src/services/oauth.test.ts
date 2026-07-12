import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { config } from '../config';

let createClient: (data: any) => Promise<any> = async (data) => ({
  ...data,
  id: 'oauth-client-1',
  createdAt: new Date(),
  updatedAt: new Date(),
  revokedAt: null,
});
let findClient: (clientId: string) => Promise<any> = async () => null;

mock.module('../repositories/oauth', () => ({
  OauthRepository: class {},
  oauthRepository: {
    createClient: (data: any) => createClient(data),
    findClient: (clientId: string) => findClient(clientId),
  },
}));

const { OauthService } = await import('./oauth');

const validScopes = [
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
];

function oauthClient(scopes: string[]) {
  return {
    id: 'oauth-client-1',
    clientId: 'client-1',
    clientSecretHash: null,
    clientName: 'Test Client',
    redirectUris: ['https://client.example/callback'],
    grantTypes: ['authorization_code'],
    responseTypes: ['code'],
    scopes,
    clientUri: null,
    logoUri: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    revokedAt: null,
  };
}

const authorizeInput = {
  responseType: 'code',
  clientId: 'client-1',
  redirectUri: 'https://client.example/callback',
  codeChallenge: 'challenge',
  codeChallengeMethod: 'S256',
};

const originalPublicBaseUrl = config.publicBaseUrl;

describe('OauthService', () => {
  beforeEach(() => {
    createClient = async (data) => ({
      ...data,
      id: 'oauth-client-1',
      createdAt: new Date(),
      updatedAt: new Date(),
      revokedAt: null,
    });
    findClient = async () => null;
  });

  afterEach(() => {
    config.publicBaseUrl = originalPublicBaseUrl;
  });

  it('registers a client requesting only claudeai with the full valid scope set', async () => {
    const service = new OauthService();

    const client = await service.registerClient({
      redirect_uris: ['https://client.example/callback'],
      scope: 'claudeai',
    });

    expect(client.scope.split(' ')).toEqual(validScopes);
  });

  it('registers a client without a scope with the full valid scope set', async () => {
    const service = new OauthService();

    const client = await service.registerClient({
      redirect_uris: ['https://client.example/callback'],
    });

    expect(client.scope.split(' ')).toEqual(validScopes);
  });

  it('keeps only valid scopes from a mixed registration request', async () => {
    const service = new OauthService();

    const client = await service.registerClient({
      redirect_uris: ['https://client.example/callback'],
      scope: 'claudeai projects:read',
    });

    expect(client.scope).toBe('projects:read');
  });

  it('falls back to the full client grant for an unknown-only authorization scope', async () => {
    findClient = async () => oauthClient(['projects:read', 'tasks:read']);
    const service = new OauthService();

    const details = await service.getAuthorizeDetails({ ...authorizeInput, scope: 'claudeai' });

    expect(details.scopes).toEqual(['projects:read', 'tasks:read']);
  });

  it('preserves a read-only client grant when it requests a write scope', async () => {
    findClient = async () => oauthClient(['projects:read']);
    const service = new OauthService();

    const details = await service.getAuthorizeDetails({ ...authorizeInput, scope: 'tasks:write' });

    expect(details.scopes).toEqual(['projects:read']);
  });

  it('rejects authorization requests for a different protected resource', async () => {
    config.publicBaseUrl = 'https://tuesday.example';
    const service = new OauthService();

    await expect(service.getAuthorizeDetails({
      ...authorizeInput,
      resource: 'https://other.example/api/mcp',
    })).rejects.toThrow('Invalid resource');
  });

  for (const resourcePath of ['/mcp', '/api/mcp']) {
    it(`accepts the ${resourcePath} protected resource`, async () => {
      config.publicBaseUrl = 'https://tuesday.example';
      findClient = async () => oauthClient(['projects:read']);
      const service = new OauthService();

      const details = await service.getAuthorizeDetails({
        ...authorizeInput,
        resource: `https://tuesday.example${resourcePath}`,
      });

      expect(details.scopes).toEqual(['projects:read']);
    });
  }
});

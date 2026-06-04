import { afterEach, describe, expect, it } from 'bun:test';
import { config } from '../config';
import { OauthService } from './oauth';

const originalPublicBaseUrl = config.publicBaseUrl;

describe('OauthService', () => {
  afterEach(() => {
    config.publicBaseUrl = originalPublicBaseUrl;
  });

  it('rejects authorization requests for a different protected resource', async () => {
    config.publicBaseUrl = 'https://tuesday.example';
    const service = new OauthService();

    await expect(service.getAuthorizeDetails({
      responseType: 'code',
      clientId: 'client-1',
      redirectUri: 'https://client.example/callback',
      codeChallenge: 'challenge',
      codeChallengeMethod: 'S256',
      resource: 'https://other.example/api/mcp',
    })).rejects.toThrow('Invalid resource');
  });
});

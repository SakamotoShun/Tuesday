import { describe, expect, it } from 'bun:test';
import { fingerprintOauthToken, generateOauthAccessToken, pkceS256Challenge, verifyPkceS256 } from './oauth';

describe('oauth utils', () => {
  it('generates prefixed random tokens', () => {
    const token = generateOauthAccessToken();
    expect(token.startsWith('tue_oauth_access_')).toBe(true);
    expect(token.length).toBeGreaterThan(40);
  });

  it('fingerprints raw tokens without returning the raw value', () => {
    const fingerprint = fingerprintOauthToken('secret-token');
    expect(fingerprint).toHaveLength(64);
    expect(fingerprint).not.toContain('secret-token');
  });

  it('verifies S256 PKCE challenges', () => {
    const verifier = 'a-valid-pkce-verifier-with-enough-entropy_123';
    const challenge = pkceS256Challenge(verifier);
    expect(verifyPkceS256(verifier, challenge)).toBe(true);
    expect(verifyPkceS256('different-verifier', challenge)).toBe(false);
  });
});

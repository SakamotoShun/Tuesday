import { describe, expect, it } from 'bun:test';
import { generateOauthToken, hashOauthToken, pkceS256Challenge, verifyPkceS256 } from './oauth';

describe('oauth utils', () => {
  it('generates prefixed random tokens', () => {
    const token = generateOauthToken('tue_oauth_test');
    expect(token.startsWith('tue_oauth_test_')).toBe(true);
    expect(token.length).toBeGreaterThan(40);
  });

  it('hashes raw tokens without returning the raw value', () => {
    const hash = hashOauthToken('secret-token');
    expect(hash).toHaveLength(64);
    expect(hash).not.toContain('secret-token');
  });

  it('verifies S256 PKCE challenges', () => {
    const verifier = 'a-valid-pkce-verifier-with-enough-entropy_123';
    const challenge = pkceS256Challenge(verifier);
    expect(verifyPkceS256(verifier, challenge)).toBe(true);
    expect(verifyPkceS256('different-verifier', challenge)).toBe(false);
  });
});

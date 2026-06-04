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

  it('verifies S256 PKCE challenges for RFC-valid verifiers', () => {
    const validVerifiers = [
      'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ',
      'a-valid-pkce-verifier.with~rfc7636_chars-123',
      '0123456789-._~ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef',
    ];

    for (const verifier of validVerifiers) {
      const challenge = pkceS256Challenge(verifier);
      expect(verifyPkceS256(verifier, challenge)).toBe(true);
      expect(verifyPkceS256(`${verifier}x`, challenge)).toBe(false);
    }
  });

  it('rejects invalid PKCE verifiers', () => {
    const challenge = pkceS256Challenge('a-valid-pkce-verifier.with~rfc7636_chars-123');
    const invalidVerifiers = [
      '',
      'too-short',
      'contains+plus-character-and-is-long-enough-123456',
      'contains/slash-character-and-is-long-enough-123456',
      'contains space character and is long enough 123456',
    ];

    for (const verifier of invalidVerifiers) {
      expect(verifyPkceS256(verifier, challenge)).toBe(false);
    }
  });
});

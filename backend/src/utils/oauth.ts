import { createHash, pbkdf2Sync, randomBytes, timingSafeEqual } from 'node:crypto';
import { config } from '../config';

const PKCE_VERIFIER_PATTERN = /^[A-Za-z0-9\-._~]{43,128}$/;

function base64Url(buffer: Buffer): string {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function generateOpaqueValue(prefix: string, bytes = 32): string {
  return `${prefix}_${base64Url(randomBytes(bytes))}`;
}

export function generateOauthClientId(): string {
  return generateOpaqueValue('tue_oauth_client', 24);
}

export function generateOauthClientSecret(): string {
  return generateOpaqueValue('tue_oauth_secret', 32);
}

export function generateOauthAuthorizationCode(): string {
  return generateOpaqueValue('tue_oauth_code', 32);
}

export function generateOauthAccessToken(): string {
  return generateOpaqueValue('tue_oauth_access', 32);
}

export function generateOauthRefreshToken(): string {
  return generateOpaqueValue('tue_oauth_refresh', 32);
}

export function fingerprintOauthToken(rawToken: string): string {
  return pbkdf2Sync(rawToken, config.sessionSecret, 210_000, 32, 'sha256').toString('hex');
}

export function pkceS256Challenge(verifier: string): string {
  return base64Url(createHash('sha256').update(verifier).digest());
}

export function verifyPkceS256(verifier: string, expectedChallenge: string): boolean {
  if (!PKCE_VERIFIER_PATTERN.test(verifier)) return false;

  const actual = pkceS256Challenge(verifier);
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expectedChallenge);
  if (actualBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(actualBuffer, expectedBuffer);
}

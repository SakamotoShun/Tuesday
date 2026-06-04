import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const BASE64URL_CHARACTERS = /[^A-Za-z0-9_-]/g;

function base64Url(buffer: Buffer): string {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function generateOauthToken(prefix: string, bytes = 32): string {
  return `${prefix}_${base64Url(randomBytes(bytes))}`;
}

export function hashOauthToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

export function pkceS256Challenge(verifier: string): string {
  return base64Url(createHash('sha256').update(verifier).digest());
}

export function verifyPkceS256(verifier: string, expectedChallenge: string): boolean {
  if (!verifier || BASE64URL_CHARACTERS.test(verifier)) return false;

  const actual = pkceS256Challenge(verifier);
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expectedChallenge);
  if (actualBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(actualBuffer, expectedBuffer);
}

export function timingSafeStringEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

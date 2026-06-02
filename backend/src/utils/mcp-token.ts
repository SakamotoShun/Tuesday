import { createHash, randomBytes } from 'node:crypto';

const TOKEN_PREFIX = 'tue_mcp_';
const ENTROPY_BYTES = 32; // 256 bits → 64 hex chars

/**
 * Generate a new MCP token.
 * Format: tue_mcp_<random hex>
 */
export function generateMcpToken(): string {
  const body = randomBytes(ENTROPY_BYTES).toString('hex');
  return `${TOKEN_PREFIX}${body}`;
}

/**
 * Hash a raw MCP token for storage.
 * Uses SHA-256. Only hashes are stored in DB.
 */
export function hashMcpToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

/**
 * Check if a string looks like a valid MCP token format.
 * Does NOT check if the token is active/valid in the DB.
 */
export function isMcpTokenFormat(value: string): boolean {
  if (!value.startsWith(TOKEN_PREFIX)) return false;
  const body = value.slice(TOKEN_PREFIX.length);
  if (body.length < 64) return false; // less than 256 bits
  if (!/^[0-9a-f]+$/.test(body)) return false;
  return true;
}
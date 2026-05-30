import { describe, it, expect } from 'bun:test';
import { generateMcpToken, hashMcpToken, isMcpTokenFormat } from './mcp-token';

describe('generateMcpToken', () => {
  it('generates a token with tue_mcp_ prefix', () => {
    const token = generateMcpToken();
    expect(token.startsWith('tue_mcp_')).toBe(true);
  });

  it('generates tokens of sufficient length (at least 48 chars)', () => {
    const token = generateMcpToken();
    expect(token.length).toBeGreaterThanOrEqual(48);
  });

  it('generates unique tokens on each call', () => {
    const t1 = generateMcpToken();
    const t2 = generateMcpToken();
    const t3 = generateMcpToken();
    expect(t1).not.toBe(t2);
    expect(t2).not.toBe(t3);
    expect(t1).not.toBe(t3);
  });

  it('uses hex characters after prefix', () => {
    const token = generateMcpToken();
    const body = token.slice('tue_mcp_'.length);
    expect(/^[0-9a-f]+$/.test(body)).toBe(true);
  });

  it('has at least 256 bits of entropy (64 hex chars)', () => {
    const token = generateMcpToken();
    const body = token.slice('tue_mcp_'.length);
    expect(body.length).toBeGreaterThanOrEqual(64);
  });
});

describe('hashMcpToken', () => {
  it('produces a sha-256 hex digest', () => {
    const hash = hashMcpToken('tue_mcp_testvalue');
    expect(hash).toHaveLength(64);
    expect(/^[0-9a-f]{64}$/.test(hash)).toBe(true);
  });

  it('produces the same hash for the same input', () => {
    const h1 = hashMcpToken('tue_mcp_abc123');
    const h2 = hashMcpToken('tue_mcp_abc123');
    expect(h1).toBe(h2);
  });

  it('produces different hashes for different inputs', () => {
    const h1 = hashMcpToken('tue_mcp_abc');
    const h2 = hashMcpToken('tue_mcp_def');
    expect(h1).not.toBe(h2);
  });

  it('never returns the raw token', () => {
    const raw = generateMcpToken();
    const hash = hashMcpToken(raw);
    expect(hash).not.toBe(raw);
  });
});

describe('isMcpTokenFormat', () => {
  it('accepts valid token format', () => {
    expect(isMcpTokenFormat('tue_mcp_' + 'a'.repeat(64))).toBe(true);
  });

  it('rejects missing prefix', () => {
    expect(isMcpTokenFormat('abc_' + 'a'.repeat(64))).toBe(false);
  });

  it('rejects too-short token', () => {
    expect(isMcpTokenFormat('tue_mcp_short')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isMcpTokenFormat('')).toBe(false);
  });

  it('rejects non-hex body', () => {
    expect(isMcpTokenFormat('tue_mcp_' + 'g'.repeat(64))).toBe(false);
  });
});
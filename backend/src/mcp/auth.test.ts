import { describe, it, expect } from 'bun:test';
import { extractBearerToken } from './auth';

describe('extractBearerToken', () => {
  it('extracts token from Authorization header', () => {
    const request = new Request('http://localhost/api/mcp', {
      headers: { Authorization: 'Bearer tue_mcp_abc123' },
    });
    expect(extractBearerToken(request)).toBe('tue_mcp_abc123');
  });

  it('returns null when no Authorization header', () => {
    const request = new Request('http://localhost/api/mcp');
    expect(extractBearerToken(request)).toBe(null);
  });

  it('returns null for non-Bearer auth', () => {
    const request = new Request('http://localhost/api/mcp', {
      headers: { Authorization: 'Basic dGVzdA==' },
    });
    expect(extractBearerToken(request)).toBe(null);
  });

  it('returns null for empty Bearer token', () => {
    const request = new Request('http://localhost/api/mcp', {
      headers: { Authorization: 'Bearer ' },
    });
    expect(extractBearerToken(request)).toBe(null);
  });

  it('trims whitespace from token', () => {
    const request = new Request('http://localhost/api/mcp', {
      headers: { Authorization: 'Bearer   tue_mcp_abc123  ' },
    });
    expect(extractBearerToken(request)).toBe('tue_mcp_abc123');
  });
});
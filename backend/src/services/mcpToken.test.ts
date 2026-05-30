import { describe, it, expect } from 'bun:test';
import { mcpTokenService, VALID_MCP_SCOPES, type McpScope } from './mcpToken';

describe('McpTokenService', () => {
  it('is defined', () => {
    expect(mcpTokenService).toBeDefined();
  });

  it('has createToken method', () => {
    expect(typeof mcpTokenService.createToken).toBe('function');
  });

  it('has listTokens method', () => {
    expect(typeof mcpTokenService.listTokens).toBe('function');
  });

  it('has revokeToken method', () => {
    expect(typeof mcpTokenService.revokeToken).toBe('function');
  });

  it('has authenticateToken method', () => {
    expect(typeof mcpTokenService.authenticateToken).toBe('function');
  });
});

describe('VALID_MCP_SCOPES', () => {
  it('includes known scopes', () => {
    expect(VALID_MCP_SCOPES.has('projects:read' as McpScope)).toBe(true);
    expect(VALID_MCP_SCOPES.has('tasks:read' as McpScope)).toBe(true);
    expect(VALID_MCP_SCOPES.has('tasks:write' as McpScope)).toBe(true);
    expect(VALID_MCP_SCOPES.has('docs:read' as McpScope)).toBe(true);
    expect(VALID_MCP_SCOPES.has('search:read' as McpScope)).toBe(true);
    expect(VALID_MCP_SCOPES.has('time:write' as McpScope)).toBe(true);
  });

  it('rejects unknown scopes', () => {
    expect(VALID_MCP_SCOPES.has('admin:delete' as McpScope)).toBe(false);
    expect(VALID_MCP_SCOPES.has('' as McpScope)).toBe(false);
  });
});
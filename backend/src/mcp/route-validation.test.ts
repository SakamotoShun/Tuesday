import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { Hono } from 'hono';
import * as auth from './auth';
import { mcp } from '../routes/mcp';
import type { McpContext } from './types';

const ctx = {
  user: { id: 'user-1', name: 'Member', role: 'member' },
  token: { userId: 'user-1', tokenId: 'token-1', scopes: new Set(['tasks:read']) },
} as McpContext;

const app = new Hono();
app.route('/mcp', mcp);

beforeEach(() => {
  spyOn(auth, 'authenticateMcpRequest').mockResolvedValue(ctx);
});
afterEach(() => mock.restore());

async function request(method: string, params: Record<string, unknown> = {}) {
  const response = await app.request('/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  return await response.json() as any;
}

describe('MCP authenticated contract', () => {
  it('lists identity and read tools without exposing write tools', async () => {
    const body = await request('tools/list');
    const names = body.result.tools.map((tool: { name: string }) => tool.name);
    expect(names).toContain('ping');
    expect(names).toContain('whoami');
    expect(names).toContain('get_task');
    expect(names).not.toContain('create_task');
    expect(names).not.toContain('get_doc');
  });

  it('rejects an ungranted write scope before input validation or mutation', async () => {
    const body = await request('tools/call', { name: 'create_task', arguments: {} });
    expect(body.result.isError).toBe(true);
    expect(body.result.structuredContent.error.code).toBe('SCOPE_REQUIRED');
  });

  it('rejects explicit null arguments instead of replacing them with an empty object', async () => {
    const body = await request('tools/call', { name: 'ping', arguments: null });
    expect(body.result.isError).toBe(true);
    expect(body.result.structuredContent.error.code).toBe('VALIDATION_ERROR');
  });

  it('defaults omitted arguments for no-input tools', async () => {
    const body = await request('tools/call', { name: 'ping' });
    expect(body.result.structuredContent.data.message).toBe('pong');
  });

  it('rejects malformed UUIDs before a service query', async () => {
    const body = await request('tools/call', { name: 'get_task', arguments: { taskId: 'not-a-uuid' } });
    expect(body.result.isError).toBe(true);
    expect(body.result.structuredContent.error.code).toBe('VALIDATION_ERROR');
    expect(JSON.parse(body.result.content[0].text)).toEqual(body.result.structuredContent);
  });
});

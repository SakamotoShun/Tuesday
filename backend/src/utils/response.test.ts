import { describe, it, expect } from 'bun:test';
import type { Context } from 'hono';
import { success, error, errors } from './response';

function createMockContext() {
  return {
    json: (payload: unknown, status?: number) => ({ payload, status }),
  } as unknown as Context;
}

describe('response helpers', () => {
  it('returns success payload with default status', () => {
    const c = createMockContext();
    const result = success(c, { ok: true }) as unknown as { payload: unknown; status?: number };
    expect(result.status).toBe(200);
    expect(result.payload).toEqual({ data: { ok: true } });
  });

  it('returns success payload with meta and custom status', () => {
    const c = createMockContext();
    const result = success(c, { ok: true }, { total: 1 }, 201) as unknown as { payload: unknown; status?: number };
    expect(result.status).toBe(201);
    expect(result.payload).toEqual({ data: { ok: true }, meta: { total: 1 } });
  });

  it('returns error payload with status', () => {
    const c = createMockContext();
    const result = error(c, 'BAD', 'Nope', [{ field: 'name', message: 'Required' }], 400) as unknown as { payload: unknown; status?: number };
    expect(result.status).toBe(400);
    expect(result.payload).toEqual({
      error: {
        code: 'BAD',
        message: 'Nope',
        details: [{ field: 'name', message: 'Required' }],
      },
    });
  });

  it('uses error helpers with proper codes', () => {
    const c = createMockContext();
    const result = errors.unauthorized(c) as unknown as { payload: unknown; status?: number };
    expect(result.status).toBe(401);
    expect(result.payload).toEqual({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      },
    });
  });
});

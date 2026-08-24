import { afterAll, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import * as logger from './logger';

const logCalls: Array<{ level: string; event: string; context: Record<string, unknown> }> = [];

const logSpy = spyOn(logger, 'log').mockImplementation(
  (level: string, event: string, context: Record<string, unknown> = {}) => {
    logCalls.push({ level, event, context });
  },
);

const { sendWebSocketMessage } = await import('./websocket');

afterAll(() => logSpy.mockRestore());

function createWebSocket(sendImpl: () => number | void) {
  const closeCalls: Array<{ code: number; reason: string }> = [];

  return {
    ws: {
      send: sendImpl,
      close: (code: number, reason: string) => {
        closeCalls.push({ code, reason });
      },
    },
    closeCalls,
  };
}

describe('sendWebSocketMessage', () => {
  beforeEach(() => {
    logCalls.length = 0;
  });

  it('keeps the socket open when Bun reports queued backpressure', () => {
    const { ws, closeCalls } = createWebSocket(() => -1);

    const result = sendWebSocketMessage(ws as any, 'payload', { hub: 'chat' });

    expect(result).toBe(true);
    expect(closeCalls).toEqual([]);
    expect(logCalls.at(-1)?.event).toBe('websocket.backpressure');
  });

  it('can skip force-closing when send failures happen during shutdown paths', () => {
    const { ws, closeCalls } = createWebSocket(() => {
      throw new Error('broken');
    });

    const result = sendWebSocketMessage(ws as any, 'payload', { hub: 'chat' }, { closeOnFailure: false });

    expect(result).toBe(false);
    expect(closeCalls).toEqual([]);
    expect(logCalls.at(-1)?.event).toBe('websocket.send_failed');
  });
});

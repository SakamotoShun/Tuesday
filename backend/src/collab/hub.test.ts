import { describe, expect, it } from 'bun:test';
import type { WSContext } from 'hono/ws';
import { DocCollabHub, type CollabClient } from './hub';
import { createBunWebSocket } from 'hono/bun';
import { sendWebSocketMessage } from '../utils/websocket';

describe('DocCollabHub with the Hono Bun adapter', () => {
  it('recognises fresh event wrappers for heartbeat, sender exclusion, and close', () => {
    const hub = new DocCollabHub();
    const { websocket } = createBunWebSocket();
    let client!: CollabClient;
    const sent: string[] = [];
    const closed: number[] = [];
    const raw = {
      readyState: 1,
      send: (message: string) => { sent.push(message); return message.length; },
      close: (code: number) => { closed.push(code); },
      data: { url: 'http://localhost/doc', events: {
        onOpen: (_event: Event, ws: WSContext) => {
          client = { ...createClient(), ws, lastSeenAt: Date.now() - 100_000, awaitingPong: true };
          hub.join('doc', client);
        },
        onMessage: (_event: MessageEvent, ws: WSContext) => {
          expect(ws).not.toBe(client.ws);
          hub.markPong('doc', ws);
          hub.broadcast('doc', 'should not echo', ws);
        },
        onClose: (_event: CloseEvent, ws: WSContext) => hub.leave('doc', ws),
      } },
    } as any;
    websocket.open(raw);
    websocket.message(raw, 'pong');
    hub.reapStaleClients();
    expect(client.awaitingPong).toBe(false);
    expect(hub.getActiveClientCount('doc')).toBe(1);
    expect(sent).toEqual([]);
    expect(closed).toEqual([]);
    websocket.close(raw, 1000, 'done');
    expect(hub.getActiveClientCount('doc')).toBe(0);
  });

  it('detects native dropped sends through the Hono wrapper', () => {
    const { websocket } = createBunWebSocket();
    let delivered: boolean | undefined;
    let closed = false;
    websocket.open({ readyState: 1, send: () => 0, close: () => { closed = true; },
      data: { url: 'http://localhost/doc', events: {
        onOpen: (_event: Event, ws: WSContext) => { delivered = sendWebSocketMessage(ws, 'update', {}); },
      } },
    } as any);
    expect(delivered).toBe(false);
    expect(closed).toBe(true);
  });

  it('buffers broadcasts until initial sync has been delivered', () => {
    const hub = new DocCollabHub();
    const sent: string[] = [];
    const client = { ...createClient(), pendingMessages: [], ws: { send: (value: string) => sent.push(value) } as unknown as WSContext };
    hub.join('doc', client);
    hub.broadcast('doc', 'first');
    hub.broadcast('doc', 'second');
    expect(sent).toEqual([]);
    expect(hub.finishInitialSync('doc', client.ws)).toBe(true);
    expect(sent).toEqual(['first', 'second']);
    hub.broadcast('doc', 'third');
    expect(sent).toEqual(['first', 'second', 'third']);
  });
});

function createClient(): CollabClient {
  return {
    ws: {} as WSContext,
    user: { id: crypto.randomUUID() } as CollabClient['user'],
    lastSeenAt: Date.now(),
    awaitingPong: false,
  };
}

describe('DocCollabHub content mutations', () => {
  it('requests checkpoints using per-document update counts', () => {
    const hub = new DocCollabHub();
    for (let index = 0; index < 49; index++) {
      expect(hub.shouldRequestSnapshot('first')).toBe(false);
    }
    expect(hub.shouldRequestSnapshot('second')).toBe(false);
    expect(hub.shouldRequestSnapshot('first')).toBe(true);
    expect(hub.shouldRequestSnapshot('first')).toBe(false);
  });

  it('blocks new collaborators while a content mutation is reserved', () => {
    const hub = new DocCollabHub();
    const release = hub.reserveContentMutation('doc-1');

    expect(release).toBeFunction();
    expect(hub.join('doc-1', createClient())).toBe('content_mutation');

    release?.();
    expect(hub.join('doc-1', createClient())).toBe('joined');
  });

  it('refuses a content mutation while collaborators are active', () => {
    const hub = new DocCollabHub();
    const client = createClient();

    expect(hub.join('doc-1', client)).toBe('joined');
    expect(hub.reserveContentMutation('doc-1')).toBeNull();

    hub.leave('doc-1', client.ws);
    expect(hub.reserveContentMutation('doc-1')).toBeFunction();
  });

  it('releases a reservation only once', () => {
    const hub = new DocCollabHub();
    const release = hub.reserveContentMutation('doc-1');

    release?.();
    release?.();

    expect(hub.reserveContentMutation('doc-1')).toBeFunction();
  });

  it('waits for in-flight collaboration writes after clients disconnect', () => {
    const hub = new DocCollabHub();
    const client = createClient();
    hub.join('doc-1', client);
    const finishWrite = hub.beginCollabWrite('doc-1');

    hub.leave('doc-1', client.ws);
    expect(hub.reserveContentMutation('doc-1')).toBeNull();

    finishWrite?.();
    expect(hub.reserveContentMutation('doc-1')).toBeFunction();
  });

  it('does not start collaboration writes during a content mutation', () => {
    const hub = new DocCollabHub();
    const release = hub.reserveContentMutation('doc-1');

    expect(hub.beginCollabWrite('doc-1')).toBeNull();
    release?.();
    expect(hub.beginCollabWrite('doc-1')).toBeFunction();
  });

  it('allows collaborators to join while normal collaboration writes are in flight', () => {
    const hub = new DocCollabHub();
    const firstClient = createClient();
    const finishFirstWrite = hub.beginCollabWrite('doc-1');

    expect(finishFirstWrite).toBeFunction();
    expect(hub.join('doc-1', firstClient)).toBe('joined');
    expect(hub.join('doc-1', createClient())).toBe('joined');

    finishFirstWrite?.();
  });

  it('allows concurrent normal collaboration writes', () => {
    const hub = new DocCollabHub();
    const finishFirstWrite = hub.beginCollabWrite('doc-1');
    const finishSecondWrite = hub.beginCollabWrite('doc-1');

    expect(finishFirstWrite).toBeFunction();
    expect(finishSecondWrite).toBeFunction();

    finishFirstWrite?.();
    expect(hub.reserveContentMutation('doc-1')).toBeNull();

    finishSecondWrite?.();
    expect(hub.reserveContentMutation('doc-1')).toBeFunction();
  });
});

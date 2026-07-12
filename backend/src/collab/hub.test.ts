import { describe, expect, it } from 'bun:test';
import type { WSContext } from 'hono/ws';
import { DocCollabHub, type CollabClient } from './hub';

function createClient(): CollabClient {
  return {
    ws: {} as WSContext,
    user: { id: crypto.randomUUID() } as CollabClient['user'],
    lastSeenAt: Date.now(),
    awaitingPong: false,
  };
}

describe('DocCollabHub content mutations', () => {
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

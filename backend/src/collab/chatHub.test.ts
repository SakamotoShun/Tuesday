import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { ChatHub } from './chatHub';

const user = {
  id: 'user-1',
  email: 'user@example.com',
  name: 'User',
  role: 'member' as const,
  isDisabled: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  avatarUrl: null,
};

function createSocket(sendResult: number | void) {
  const closeCalls: Array<{ code: number; reason: string }> = [];

  return {
    send: () => sendResult,
    close: (code: number, reason: string) => {
      closeCalls.push({ code, reason });
    },
    closeCalls,
  };
}

describe('chatHub', () => {
  let hub: ChatHub;
  let currentTime = 1_000;
  const originalDateNow = Date.now;

  beforeEach(() => {
    currentTime = 1_000;
    Date.now = () => currentTime;
    hub = new ChatHub();
  });

  afterEach(() => {
    Date.now = originalDateNow;
    hub.shutdown();
  });

  it('does not evict clients when sends are backpressured but still queued', () => {
    const socket = createSocket(-1);
    const connection = hub.connect(socket as any, user as any);

    expect(connection).not.toBeNull();
    expect(hub.subscribeToChannel('channel-1', user.id, socket as any)).toBe(true);

    hub.broadcastToChannel('channel-1', JSON.stringify({ type: 'ping' }));

    expect(hub.getStats().connections).toBe(1);
    expect(hub.isUserOnline(user.id)).toBe(true);
  });

  it('tracks total connections through connect and disconnect', () => {
    const firstSocket = createSocket(undefined);
    const secondSocket = createSocket(undefined);

    expect(hub.connect(firstSocket as any, user as any)).not.toBeNull();
    expect(hub.connect(secondSocket as any, user as any)).not.toBeNull();
    expect(hub.getStats().connections).toBe(2);

    hub.disconnect(firstSocket as any, user.id);

    expect(hub.getStats().connections).toBe(1);
  });

  it('uses the restart close code during shutdown even when the final send fails', () => {
    const socket = createSocket(0);
    expect(hub.connect(socket as any, user as any)).not.toBeNull();

    hub.shutdown();

    expect(socket.closeCalls).toEqual([{ code: 1012, reason: 'Service restarting' }]);
    expect(hub.getStats().connections).toBe(0);
  });

  it('reaps stale clients that do not answer heartbeats', () => {
    const heartbeatMessages: string[] = [];
    const socket = {
      send: (payload: string) => {
        heartbeatMessages.push(payload);
      },
      close: (code: number, reason: string) => {
        socket.closeCalls.push({ code, reason });
      },
      closeCalls: [] as Array<{ code: number; reason: string }>,
    };

    expect(hub.connect(socket as any, user as any)).not.toBeNull();

    currentTime = 31_000;
    hub.reapStaleClients(currentTime);

    expect(heartbeatMessages).toHaveLength(1);
    expect(JSON.parse(heartbeatMessages[0] ?? '{}')).toMatchObject({ type: 'ping', ts: currentTime });
    expect(hub.getStats().awaitingPong).toBe(1);

    currentTime = 91_000;
    hub.reapStaleClients(currentTime);

    expect(socket.closeCalls).toEqual([{ code: 1001, reason: 'Connection timed out' }]);
    expect(hub.getStats().connections).toBe(0);
  });

  it('keeps active clients when they answer heartbeats', () => {
    const socket = createSocket(undefined);
    expect(hub.connect(socket as any, user as any)).not.toBeNull();

    currentTime = 32_000;
    hub.reapStaleClients(currentTime);
    expect(hub.getStats().awaitingPong).toBe(1);

    currentTime = 32_000;
    hub.markPong(socket as any, user.id);
    expect(hub.getStats().awaitingPong).toBe(0);

    currentTime = 91_000;
    hub.reapStaleClients(currentTime);

    expect(socket.closeCalls).toEqual([]);
    expect(hub.getStats().connections).toBe(1);
  });
});

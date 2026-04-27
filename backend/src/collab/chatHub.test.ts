import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { chatHub } from './chatHub';

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
  beforeEach(() => {
    chatHub.shutdown();
  });

  afterEach(() => {
    chatHub.shutdown();
  });

  it('does not evict clients when sends are backpressured but still queued', () => {
    const socket = createSocket(-1);
    const connection = chatHub.connect(socket as any, user as any);

    expect(connection).not.toBeNull();
    expect(chatHub.subscribeToChannel('channel-1', user.id, socket as any)).toBe(true);

    chatHub.broadcastToChannel('channel-1', JSON.stringify({ type: 'ping' }));

    expect(chatHub.getStats().connections).toBe(1);
    expect(chatHub.isUserOnline(user.id)).toBe(true);
  });

  it('tracks total connections through connect and disconnect', () => {
    const firstSocket = createSocket(undefined);
    const secondSocket = createSocket(undefined);

    expect(chatHub.connect(firstSocket as any, user as any)).not.toBeNull();
    expect(chatHub.connect(secondSocket as any, user as any)).not.toBeNull();
    expect(chatHub.getStats().connections).toBe(2);

    chatHub.disconnect(firstSocket as any, user.id);

    expect(chatHub.getStats().connections).toBe(1);
  });

  it('uses the restart close code during shutdown even when the final send fails', () => {
    const socket = createSocket(0);
    expect(chatHub.connect(socket as any, user as any)).not.toBeNull();

    chatHub.shutdown();

    expect(socket.closeCalls).toEqual([{ code: 1012, reason: 'Service restarting' }]);
    expect(chatHub.getStats().connections).toBe(0);
  });
});

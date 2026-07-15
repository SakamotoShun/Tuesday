import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { Hono } from 'hono';

// Mutable mock returns — reassigned per test group
const freelancerUser = {
  id: 'free-1',
  email: 'free@example.com',
  name: 'Freelancer',
  role: 'freelancer' as const,
  isDisabled: false,
  avatarUrl: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const adminUser = {
  ...freelancerUser,
  id: 'admin-1',
  email: 'admin@example.com',
  name: 'Admin',
  role: 'admin' as const,
};

let currentUser: typeof freelancerUser | typeof adminUser = freelancerUser;
let appendedUpdates: Array<{ docId: string; update: Uint8Array; userId: string }> = [];
let broadcasts: Array<{ docId: string; message: string; exclude: unknown }> = [];
let createdSnapshots: Array<{ docId: string; snapshot: Uint8Array; seq: number }> = [];
let compactedSnapshots: Array<{ docId: string; seq: number }> = [];
let canonicalUpdates: Array<{ docId: string; data: Record<string, unknown> }> = [];
let whiteboardLatestSeq = 0;
let shouldRequestWhiteboardSnapshot = false;
let appendedWhiteboardUpdates: Array<{ whiteboardId: string; update: Record<string, unknown>; userId: string }> = [];
let whiteboardBroadcasts: Array<{ whiteboardId: string; message: string; exclude: unknown }> = [];
let createdWhiteboardSnapshots: Array<{ whiteboardId: string; snapshot: Record<string, unknown>; seq: number }> = [];
let compactedWhiteboardSnapshots: Array<{ whiteboardId: string; seq: number }> = [];
let canonicalWhiteboardUpdates: Array<{ whiteboardId: string; data: Record<string, unknown> }> = [];

const { collab, setCollabDependenciesForTests } = await import('./collab');
const { websocket } = await import('../websocket');

const app = new Hono();
app.route('/collab', collab);

let server: ReturnType<typeof Bun.serve>;
let wsBase: string;

beforeAll(() => {
  setCollabDependenciesForTests({
    validateSession: async () => currentUser,
    getDoc: async () => ({ id: 'doc-1', projectId: 'proj-1', title: 'Test', createdBy: 'admin-1' } as any),
    getWhiteboard: async () => ({ id: 'wb-1', projectId: 'proj-1', title: 'Test WB', data: null } as any),
    docCollabRepository: {
      getLatestSnapshot: async () => null,
      countUpdatesInRange: async () => 0,
      getUpdatesInRange: async () => [],
      getUpdatesSince: async () => [],
      getLatestSeq: async () => 0,
      appendUpdate: async (docId: string, update: Uint8Array, userId: string) => {
        appendedUpdates.push({ docId, update, userId });
        return 7;
      },
      createSnapshot: async (docId: string, snapshot: Uint8Array, seq: number) => {
        createdSnapshots.push({ docId, snapshot, seq });
      },
      compactHistory: async (docId: string, seq: number) => {
        compactedSnapshots.push({ docId, seq });
      },
    } as any,
    docRepository: {
      update: async (docId: string, data: Record<string, unknown>) => {
        canonicalUpdates.push({ docId, data });
        return {};
      },
    } as any,
    whiteboardCollabRepository: {
      getLatestSnapshot: async () => null,
      countUpdatesInRange: async () => 0,
      getUpdatesInRange: async () => [],
      getUpdatesSince: async () => [],
      getLatestSeq: async () => whiteboardLatestSeq,
      appendUpdate: async (whiteboardId: string, update: Record<string, unknown>, userId: string) => {
        appendedWhiteboardUpdates.push({ whiteboardId, update, userId });
        whiteboardLatestSeq += 1;
        return whiteboardLatestSeq;
      },
      createSnapshot: async (whiteboardId: string, snapshot: Record<string, unknown>, seq: number) => {
        createdWhiteboardSnapshots.push({ whiteboardId, snapshot, seq });
      },
      compactHistory: async (whiteboardId: string, seq: number) => {
        compactedWhiteboardSnapshots.push({ whiteboardId, seq });
      },
    } as any,
    whiteboardRepository: {
      update: async (whiteboardId: string, data: Record<string, unknown>) => {
        canonicalWhiteboardUpdates.push({ whiteboardId, data });
        return {};
      },
    } as any,
    docCollabHub: {
      join: () => 'joined',
      beginCollabWrite: () => () => {},
      leave: () => {},
      touch: () => {},
      markPong: () => {},
      broadcast: (docId: string, message: string, exclude: unknown) => {
        broadcasts.push({ docId, message, exclude });
      },
      shouldRequestSnapshot: () => false,
      getStats: () => ({ activeRooms: 0, clients: 0 }),
    } as any,
    whiteboardCollabHub: {
      join: () => true,
      leave: () => {},
      touch: () => {},
      markPong: () => {},
      broadcast: (whiteboardId: string, message: string, exclude: unknown) => {
        whiteboardBroadcasts.push({ whiteboardId, message, exclude });
      },
      shouldRequestSnapshot: () => shouldRequestWhiteboardSnapshot,
      listCollaborators: () => [],
      getStats: () => ({ activeRooms: 0, clients: 0 }),
    } as any,
  });

  server = Bun.serve({
    port: 0,
    fetch: (req, srv) => app.fetch(req, { server: srv }),
    websocket,
  });
  wsBase = `ws://localhost:${server.port}`;
});

beforeEach(() => {
  currentUser = freelancerUser;
  appendedUpdates = [];
  broadcasts = [];
  createdSnapshots = [];
  compactedSnapshots = [];
  canonicalUpdates = [];
  whiteboardLatestSeq = 0;
  shouldRequestWhiteboardSnapshot = false;
  appendedWhiteboardUpdates = [];
  whiteboardBroadcasts = [];
  createdWhiteboardSnapshots = [];
  compactedWhiteboardSnapshots = [];
  canonicalWhiteboardUpdates = [];
});

afterAll(() => {
  setCollabDependenciesForTests(null);
  server.stop(true);
});

function connectWs(path: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${wsBase}${path}`, {
      headers: { Cookie: 'session_id=test-session' },
    } as any);
    ws.onopen = () => resolve(ws);
    ws.onerror = () => reject(new Error(`WS connect failed: ${wsBase}${path}`));
  });
}

function waitFor(ws: WebSocket, pred: (m: any) => boolean, ms = 3000): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for message on ${ws.url}`)), ms);
    const handler = (e: MessageEvent) => {
      const msg = JSON.parse(e.data as string);
      if (pred(msg)) {
        clearTimeout(timer);
        ws.removeEventListener('message', handler);
        resolve(msg);
      }
    };
    ws.addEventListener('message', handler);
  });
}

async function waitUntil(predicate: () => boolean, ms = 3000): Promise<void> {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt >= ms) {
      throw new Error('timeout waiting for collaboration side effect');
    }
    await Bun.sleep(10);
  }
}

describe('Collab WebSocket — freelancer read-only enforcement', () => {
  describe('doc collab ops', () => {
    it('sends read_only error for doc.update', async () => {
      const ws = await connectWs('/collab/docs/doc-1');
      await waitFor(ws, (m) => m.type === 'doc.sync');
      ws.send(JSON.stringify({ type: 'doc.update', update: 'AAAA' }));
      const err = await waitFor(ws, (m) => m.type === 'error');
      expect(err).toMatchObject({ type: 'error', code: 'read_only', op: 'doc.update' });
      ws.close();
    });

    it('sends read_only error for presence.update', async () => {
      const ws = await connectWs('/collab/docs/doc-1');
      await waitFor(ws, (m) => m.type === 'doc.sync');
      ws.send(JSON.stringify({ type: 'presence.update', update: 'AAAA' }));
      const err = await waitFor(ws, (m) => m.type === 'error');
      expect(err).toMatchObject({ type: 'error', code: 'read_only', op: 'presence.update' });
      ws.close();
    });

    it('sends read_only error for doc.snapshot', async () => {
      const ws = await connectWs('/collab/docs/doc-1');
      await waitFor(ws, (m) => m.type === 'doc.sync');
      ws.send(JSON.stringify({ type: 'doc.snapshot', snapshot: 'AAAA' }));
      const err = await waitFor(ws, (m) => m.type === 'error');
      expect(err).toMatchObject({ type: 'error', code: 'read_only', op: 'doc.snapshot' });
      ws.close();
    });
  });

  describe('whiteboard collab ops', () => {
    it('sends read_only error for whiteboard.update', async () => {
      const ws = await connectWs('/collab/whiteboards/wb-1');
      await waitFor(ws, (m) => m.type === 'whiteboard.sync');
      ws.send(JSON.stringify({ type: 'whiteboard.update', update: { elements: [] } }));
      const err = await waitFor(ws, (m) => m.type === 'error');
      expect(err).toMatchObject({ type: 'error', code: 'read_only', op: 'whiteboard.update' });
      ws.close();
    });

    it('sends read_only error for whiteboard.presence', async () => {
      const ws = await connectWs('/collab/whiteboards/wb-1');
      await waitFor(ws, (m) => m.type === 'whiteboard.sync');
      ws.send(JSON.stringify({ type: 'whiteboard.presence', update: {} }));
      const err = await waitFor(ws, (m) => m.type === 'error');
      expect(err).toMatchObject({ type: 'error', code: 'read_only', op: 'whiteboard.presence' });
      ws.close();
    });

    it('sends read_only error for whiteboard.snapshot', async () => {
      const ws = await connectWs('/collab/whiteboards/wb-1');
      await waitFor(ws, (m) => m.type === 'whiteboard.sync');
      ws.send(JSON.stringify({ type: 'whiteboard.snapshot', snapshot: { elements: [] } }));
      const err = await waitFor(ws, (m) => m.type === 'error');
      expect(err).toMatchObject({ type: 'error', code: 'read_only', op: 'whiteboard.snapshot' });
      ws.close();
    });
  });
});

describe('Collab WebSocket — normal document collaboration', () => {
  beforeEach(() => {
    currentUser = adminUser;
  });

  it('syncs, persists, broadcasts, and acknowledges document updates', async () => {
    const ws = await connectWs('/collab/docs/doc-1');
    const sync = await waitFor(ws, (message) => message.type === 'doc.sync');
    expect(sync).toMatchObject({ snapshot: null, updates: [], latestSeq: 0 });

    const ackPromise = waitFor(ws, (message) => message.type === 'doc.ack');
    ws.send(JSON.stringify({ type: 'doc.update', update: 'AQID' }));
    expect(await ackPromise).toMatchObject({ type: 'doc.ack', seq: 7 });

    expect(appendedUpdates).toHaveLength(1);
    expect(appendedUpdates[0]).toMatchObject({ docId: 'doc-1', userId: adminUser.id });
    expect(Array.from(appendedUpdates[0]!.update)).toEqual([1, 2, 3]);
    expect(broadcasts).toHaveLength(1);
    expect(JSON.parse(broadcasts[0]!.message)).toMatchObject({
      type: 'doc.update',
      update: 'AQID',
      seq: 7,
      actorId: adminUser.id,
    });

    ws.close();
  });

  it('continues broadcasting collaborator presence', async () => {
    const ws = await connectWs('/collab/docs/doc-1');
    await waitFor(ws, (message) => message.type === 'doc.sync');

    ws.send(JSON.stringify({ type: 'presence.update', update: 'presence-state' }));
    await waitUntil(() => broadcasts.length === 1);

    expect(JSON.parse(broadcasts[0]!.message)).toEqual({
      type: 'presence.broadcast',
      update: 'presence-state',
    });

    ws.close();
  });

  it('persists current snapshots and canonical document content', async () => {
    const ws = await connectWs('/collab/docs/doc-1');
    await waitFor(ws, (message) => message.type === 'doc.sync');
    const content = [{ id: 'paragraph-1', type: 'paragraph', content: [] }];

    ws.send(JSON.stringify({ type: 'doc.snapshot', snapshot: 'BAUG', seq: 0, content }));
    await waitUntil(() => canonicalUpdates.length === 1);

    expect(createdSnapshots).toHaveLength(1);
    expect(createdSnapshots[0]).toMatchObject({ docId: 'doc-1', seq: 0 });
    expect(Array.from(createdSnapshots[0]!.snapshot)).toEqual([4, 5, 6]);
    expect(compactedSnapshots).toEqual([{ docId: 'doc-1', seq: 0 }]);
    expect(canonicalUpdates[0]).toMatchObject({ docId: 'doc-1' });
    expect(canonicalUpdates[0]!.data.content).toEqual(content);

    ws.close();
  });
});

describe('Collab WebSocket — normal whiteboard collaboration', () => {
  beforeEach(() => {
    currentUser = adminUser;
  });

  it('persists, broadcasts, and acknowledges complete scenes', async () => {
    const ws = await connectWs('/collab/whiteboards/wb-1');
    await waitFor(ws, (message) => message.type === 'whiteboard.sync');
    const scene = {
      elements: [{ id: 'image-1', version: 1, fileId: 'file-1' }],
      files: { 'file-1': { id: 'file-1', dataURL: 'data:image/png;base64,AQID' } },
    };

    const ackPromise = waitFor(ws, (message) => message.type === 'whiteboard.ack');
    ws.send(JSON.stringify({ type: 'whiteboard.update', update: scene }));

    expect(await ackPromise).toEqual({ type: 'whiteboard.ack', seq: 1 });
    expect(appendedWhiteboardUpdates).toEqual([{
      whiteboardId: 'wb-1',
      update: scene,
      userId: adminUser.id,
    }]);
    const updateBroadcast = whiteboardBroadcasts
      .map((broadcast) => JSON.parse(broadcast.message))
      .find((message) => message.type === 'whiteboard.update');
    expect(updateBroadcast).toMatchObject({
      type: 'whiteboard.update',
      update: scene,
      seq: 1,
      actorId: adminUser.id,
    });
    ws.close();
  });

  it('accepts pasted scenes larger than the former 1 MiB limit', async () => {
    const ws = await connectWs('/collab/whiteboards/wb-1');
    await waitFor(ws, (message) => message.type === 'whiteboard.sync');
    const scene = {
      elements: [{ id: 'image-1', version: 1, fileId: 'file-1' }],
      files: { 'file-1': { id: 'file-1', dataURL: `data:image/png;base64,${'A'.repeat(1_100_000)}` } },
    };

    const ackPromise = waitFor(ws, (message) => message.type === 'whiteboard.ack');
    ws.send(JSON.stringify({ type: 'whiteboard.update', update: scene }));

    expect(await ackPromise).toEqual({ type: 'whiteboard.ack', seq: 1 });
    expect(appendedWhiteboardUpdates).toHaveLength(1);
    ws.close();
  });

  it('includes the represented sequence in snapshot requests', async () => {
    shouldRequestWhiteboardSnapshot = true;
    const ws = await connectWs('/collab/whiteboards/wb-1');
    await waitFor(ws, (message) => message.type === 'whiteboard.sync');
    const requestPromise = waitFor(ws, (message) => message.type === 'whiteboard.snapshot.request');

    ws.send(JSON.stringify({
      type: 'whiteboard.update',
      update: { elements: [{ id: 'shape-1', version: 1 }], files: {} },
    }));

    expect(await requestPromise).toEqual({ type: 'whiteboard.snapshot.request', seq: 1 });
    ws.close();
  });

  it('compacts only through the sequence represented by a snapshot', async () => {
    whiteboardLatestSeq = 51;
    const ws = await connectWs('/collab/whiteboards/wb-1');
    await waitFor(ws, (message) => message.type === 'whiteboard.sync');
    const snapshot = { elements: [{ id: 'shape-1', version: 50 }], files: {} };

    ws.send(JSON.stringify({ type: 'whiteboard.snapshot', snapshot, seq: 50 }));
    await waitUntil(() => createdWhiteboardSnapshots.length === 1);

    expect(createdWhiteboardSnapshots[0]).toEqual({ whiteboardId: 'wb-1', snapshot, seq: 50 });
    expect(compactedWhiteboardSnapshots).toEqual([{ whiteboardId: 'wb-1', seq: 50 }]);
    expect(canonicalWhiteboardUpdates).toHaveLength(0);
    ws.close();
  });

  it('rejects malformed scenes without persisting them', async () => {
    const ws = await connectWs('/collab/whiteboards/wb-1');
    await waitFor(ws, (message) => message.type === 'whiteboard.sync');
    const errorPromise = waitFor(ws, (message) => message.type === 'error');

    ws.send(JSON.stringify({ type: 'whiteboard.update', update: { elements: 'invalid' } }));

    expect(await errorPromise).toMatchObject({
      type: 'error',
      code: 'invalid_message',
      op: 'whiteboard.update',
    });
    expect(appendedWhiteboardUpdates).toHaveLength(0);
    ws.close();
  });
});

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import * as Y from 'yjs';
import {
  DocSyncBusyError,
  DocNotFoundError,
  DocSyncTooLargeError,
  MAX_DOC_UPDATE_BYTES,
} from '../collab/docHistory';

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
let docLatestSeq = 0;
let docCanonicalSeq: number | null = 0;
let docSyncError: Error | null = null;
let docReadError: Error | null = null;
let docGeneration: string | undefined;
let canonicalSnapshotResult: any = { status: 'persisted', doc: {} };
let accessGate: Promise<void> | null = null;
let denyDocAccess = false;
let sessionValid = true;
let evidenceRequests: unknown[][] = [];
let appendGate: Promise<void> | null = null;
let appendStarted = 0;
let receivedMessages = 0;
let joinedDocs = 0;
let closedConnections = 0;
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
    validateSession: async () => sessionValid ? currentUser : null,
    getDoc: async () => {
      if (accessGate) await accessGate;
      if (denyDocAccess) throw new Error('Access denied');
      if (docReadError) throw docReadError;
      return { id: 'doc-1', projectId: 'proj-1', title: 'Test', createdBy: 'admin-1' } as any;
    },
    getWhiteboard: async () => ({ id: 'wb-1', projectId: 'proj-1', title: 'Test WB', data: null } as any),
    docCollabRepository: {
      loadEvidenceSync: async (...args: unknown[]) => {
        if (denyDocAccess) throw new Error('Access denied');
        evidenceRequests.push(args);
        return { type: 'doc.evidence.sync', requestId: args[3], generation: docGeneration, journal: null };
      },
      loadSyncState: async () => {
        if (docSyncError) throw docSyncError;
        return {
          snapshot: null,
          updates: [],
          latestSeq: docLatestSeq,
          hasMore: false,
          docVersion: 1,
          canonicalSeq: docCanonicalSeq,
          baseSnapshotId: null,
          baseSeq: 0,
          generation: docGeneration,
        };
      },
      getLatestSnapshot: async () => null,
      countUpdatesInRange: async () => 0,
      getUpdatesInRange: async () => [],
      getUpdatesSince: async () => [],
      getLatestSeq: async () => docLatestSeq,
      appendUpdate: async (docId: string, update: Uint8Array, userId: string) => {
        appendStarted += 1;
        if (appendGate) await appendGate;
        appendedUpdates.push({ docId, update, userId });
        return 7;
      },
      createSnapshotAndCompactIfCurrent: async (
        docId: string,
        snapshot: Uint8Array,
        _expectedDocVersion: number,
        _expectedBaseSnapshotId: string | null,
        _expectedBaseSeq: number,
        seq: number,
      ) => {
        createdSnapshots.push({ docId, snapshot, seq });
        compactedSnapshots.push({ docId, seq });
        return 'compacted';
      },
      persistCanonicalSnapshot: async (docId: string, snapshot: Uint8Array, seq: number) => {
        if (canonicalSnapshotResult.status === 'persisted') {
          createdSnapshots.push({ docId, snapshot, seq });
          compactedSnapshots.push({ docId, seq });
          canonicalUpdates.push({ docId, data: {} });
        }
        return canonicalSnapshotResult;
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
      join: () => { joinedDocs += 1; return 'joined'; },
      finishInitialSync: () => true,
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
    websocket: { ...websocket, close: (ws, code, reason) => {
      websocket.close(ws, code, reason);
      closedConnections += 1;
    }, message: (ws, message) => {
      receivedMessages += 1;
      websocket.message(ws, message);
    } },
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
  docLatestSeq = 0;
  docCanonicalSeq = 0;
  docSyncError = null;
  docReadError = null;
  docGeneration = undefined;
  canonicalSnapshotResult = { status: 'persisted', doc: {} };
  accessGate = null;
  denyDocAccess = false;
  sessionValid = true;
  evidenceRequests = [];
  appendGate = null;
  appendStarted = 0;
  receivedMessages = 0;
  joinedDocs = 0;
  closedConnections = 0;
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

function connectUntilClosed(path: string): Promise<{ code: number; reason: string }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${wsBase}${path}`, {
      headers: { Cookie: 'session_id=test-session' },
    } as any);
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error(`timeout waiting for close on ${ws.url}`));
    }, 3000);
    ws.onclose = (event) => {
      clearTimeout(timer);
      resolve({ code: event.code, reason: event.reason });
    };
    ws.onerror = () => {
      clearTimeout(timer);
      reject(new Error(`WS connect failed: ${wsBase}${path}`));
    };
  });
}

function waitForClose(ws: WebSocket): Promise<{ code: number; reason: string }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for close on ${ws.url}`)), 3000);
    ws.addEventListener('close', (event) => {
      clearTimeout(timer);
      resolve({ code: event.code, reason: event.reason });
    }, { once: true });
  });
}

function yUpdateBase64(): string {
  const doc = new Y.Doc();
  doc.getMap('content').set('key', 'value');
  return Buffer.from(Y.encodeStateAsUpdate(doc)).toString('base64');
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

describe('Removed document evidence protocol', () => {
  it('advertises server persistence and rejects obsolete evidence requests', async () => {
    docGeneration = crypto.randomUUID();
    const ws = await connectWs('/collab/docs/doc-1');
    expect(await waitFor(ws, message => message.type === 'doc.sync')).toMatchObject({ persistence: 'server' });
    const request = { type: 'doc.evidence.request', version: 1, generation: docGeneration, requestId: crypto.randomUUID() };
    const close = waitForClose(ws);
    ws.send(JSON.stringify(request));
    expect((await close).code).toBe(1007);
    expect(evidenceRequests).toHaveLength(0);
    expect(appendedUpdates).toHaveLength(0);
    ws.close();
  });

  for (const condition of ['expired_session', 'revoked_access', 'old_generation', 'invalid_request'] as const) {
    it(`does not disclose evidence for ${condition}`, async () => {
      docGeneration = crypto.randomUUID();
      const ws = await connectWs('/collab/docs/doc-1');
      await waitFor(ws, message => message.type === 'doc.sync');
      if (condition === 'expired_session') sessionValid = false;
      if (condition === 'revoked_access') denyDocAccess = true;
      const close = waitForClose(ws);
      ws.send(JSON.stringify({ type: 'doc.evidence.request', version: condition === 'invalid_request' ? 2 : 1,
        generation: condition === 'old_generation' ? crypto.randomUUID() : docGeneration, requestId: crypto.randomUUID() }));
      expect((await close).code).toBe(1007);
      expect(evidenceRequests).toHaveLength(0);
    });
  }
});

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

  it.each(['doc.update', 'doc.snapshot'])('refuses an old generation on %s before persistence', async type => {
    docGeneration = 'current-generation';
    const ws = await connectWs('/collab/docs/doc-1');
    expect(await waitFor(ws, message => message.type === 'doc.sync')).toMatchObject({ generation: docGeneration });
    const error = waitFor(ws, message => message.type === 'error');
    ws.send(JSON.stringify({ type, generation: 'old-generation', update: yUpdateBase64(), snapshot: yUpdateBase64(), seq: 0 }));
    expect(await error).toMatchObject({ code: 'resync_required' });
    expect(appendedUpdates).toHaveLength(0);
    expect(createdSnapshots).toHaveLength(0);
    ws.close();
  });

  it('echoes the operation identity in durable ACKs and broadcasts', async () => {
    docGeneration = crypto.randomUUID();
    const ws = await connectWs('/collab/docs/doc-1');
    expect(await waitFor(ws, message => message.type === 'doc.sync')).toMatchObject({ acknowledgement: 'operation_id' });
    const operationId = crypto.randomUUID();
    const ack = waitFor(ws, message => message.type === 'doc.ack');
    ws.send(JSON.stringify({ type: 'doc.update', generation: docGeneration, operationId, update: yUpdateBase64() }));
    expect(await ack).toMatchObject({ operationId, generation: docGeneration, seq: 7 });
    expect(JSON.parse(broadcasts[0]!.message)).toMatchObject({ operationId, generation: docGeneration, seq: 7 });
    ws.close();
  });

  it.each([undefined, 'not-a-uuid'])('refuses a missing/malformed operation identity: %s', async operationId => {
    docGeneration = crypto.randomUUID();
    const ws = await connectWs('/collab/docs/doc-1');
    await waitFor(ws, message => message.type === 'doc.sync');
    const error = waitFor(ws, message => message.type === 'error');
    ws.send(JSON.stringify({ type: 'doc.update', generation: docGeneration, operationId, update: yUpdateBase64() }));
    expect(await error).toMatchObject({ code: 'invalid_update' });
    expect(appendedUpdates).toHaveLength(0);
    ws.close();
  });

  it('does not admit updates while document authorization is pending', async () => {
    const gate = Promise.withResolvers<void>();
    accessGate = gate.promise;
    denyDocAccess = true;
    const ws = await connectWs('/collab/docs/doc-1');
    const closed = waitForClose(ws);
    try {
      ws.send(JSON.stringify({ type: 'doc.update', update: yUpdateBase64() }));
      await waitUntil(() => receivedMessages === 1);
      expect(appendStarted).toBe(0);
    } finally { gate.resolve(); }
    expect(await closed).toMatchObject({ code: 1008, reason: 'Access denied' });
    expect(appendedUpdates).toHaveLength(0);
    expect(joinedDocs).toBe(0);
  });

  it('does not join a room after closing during authorization', async () => {
    const gate = Promise.withResolvers<void>();
    accessGate = gate.promise;
    const ws = await connectWs('/collab/docs/doc-1');
    const closed = waitForClose(ws);
    ws.close();
    await closed;
    await waitUntil(() => closedConnections > 0);
    gate.resolve();
    // Let the suspended open handler finish before inspecting room admission.
    await gate.promise;
    await Bun.sleep(0);
    expect(joinedDocs).toBe(0);
  });

  it('serializes writes even though Hono does not await message handlers', async () => {
    const gate = Promise.withResolvers<void>();
    appendGate = gate.promise;
    const ws = await connectWs('/collab/docs/doc-1');
    await waitFor(ws, (message) => message.type === 'doc.sync');
    try {
      ws.send(JSON.stringify({ type: 'doc.update', update: yUpdateBase64() }));
      await waitUntil(() => appendStarted === 1);
      ws.send(JSON.stringify({ type: 'doc.update', update: yUpdateBase64() }));
      await waitUntil(() => receivedMessages === 2);
      expect(appendStarted).toBe(1);
    } finally { gate.resolve(); }
    await waitUntil(() => appendedUpdates.length === 2);
    expect(broadcasts).toHaveLength(2);
    ws.close();
  });

  it('keeps editing when snapshots become stale while waiting for the row lock', async () => {
    canonicalSnapshotResult = { status: 'stale_seq', currentSeq: 1 };
    const ws = await connectWs('/collab/docs/doc-1');
    await waitFor(ws, (message) => message.type === 'doc.sync');
    ws.send(JSON.stringify({ type: 'doc.snapshot', snapshot: yUpdateBase64(), seq: 0 }));
    ws.send(JSON.stringify({ type: 'doc.snapshot', snapshot: yUpdateBase64(), seq: 0 }));
    const ack = waitFor(ws, (message) => message.type === 'doc.ack');
    ws.send(JSON.stringify({ type: 'doc.update', update: yUpdateBase64() }));
    expect(await ack).toMatchObject({ seq: 7 });
    expect(createdSnapshots).toHaveLength(0);
    ws.close();
  });

  it('orders commit and broadcast across different connections to the same document', async () => {
    const first = await connectWs('/collab/docs/doc-1');
    await waitFor(first, (message) => message.type === 'doc.sync');
    const second = await connectWs('/collab/docs/doc-1');
    await waitFor(second, (message) => message.type === 'doc.sync');
    const gate = Promise.withResolvers<void>();
    appendGate = gate.promise;
    try {
      first.send(JSON.stringify({ type: 'doc.update', update: yUpdateBase64() }));
      await waitUntil(() => appendStarted === 1);
      second.send(JSON.stringify({ type: 'doc.update', update: yUpdateBase64() }));
      await waitUntil(() => receivedMessages === 2);
      expect(appendStarted).toBe(1);
      expect(broadcasts).toHaveLength(0);
    } finally { gate.resolve(); }
    await waitUntil(() => appendedUpdates.length === 2);
    expect(broadcasts).toHaveLength(2);
    first.close();
    second.close();
  });

  it('finishes admitted updates when the client closes before receiving ACKs', async () => {
    const ws = await connectWs('/collab/docs/doc-1');
    await waitFor(ws, (message) => message.type === 'doc.sync');
    const gate = Promise.withResolvers<void>();
    appendGate = gate.promise;
    try {
      ws.send(JSON.stringify({ type: 'doc.update', update: yUpdateBase64() }));
      await waitUntil(() => appendStarted === 1);
      ws.send(JSON.stringify({ type: 'doc.update', update: yUpdateBase64() }));
      await waitUntil(() => receivedMessages === 2);
      ws.close();
      await waitUntil(() => closedConnections > 0);
    } finally { gate.resolve(); }
    await waitUntil(() => appendedUpdates.length === 2);
    expect(broadcasts).toHaveLength(2);
  });

  it('syncs, persists, broadcasts, and acknowledges document updates', async () => {
    const ws = await connectWs('/collab/docs/doc-1');
    const sync = await waitFor(ws, (message) => message.type === 'doc.sync');
    expect(sync).toMatchObject({ snapshot: null, updates: [], latestSeq: 0 });

    const ackPromise = waitFor(ws, (message) => message.type === 'doc.ack');
    const update = yUpdateBase64();
    ws.send(JSON.stringify({ type: 'doc.update', update }));
    expect(await ackPromise).toMatchObject({ type: 'doc.ack', seq: 7 });

    expect(appendedUpdates).toHaveLength(1);
    expect(appendedUpdates[0]).toMatchObject({ docId: 'doc-1', userId: adminUser.id });
    expect(Buffer.from(appendedUpdates[0]!.update).toString('base64')).toBe(update);
    expect(broadcasts).toHaveLength(1);
    expect(JSON.parse(broadcasts[0]!.message)).toMatchObject({
      type: 'doc.update',
      update,
      seq: 7,
      actorId: adminUser.id,
    });

    ws.close();
  });

  it('advertises server-owned saves after writable clients synchronize', async () => {
    docLatestSeq = 4;
    docCanonicalSeq = 0;
    const ws = await connectWs('/collab/docs/doc-1');
    expect(await waitFor(ws, (message) => message.type === 'doc.sync')).toMatchObject({ persistence: 'server' });
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

  it('rejects non-canonical base64 without appending or acknowledging', async () => {
    const ws = await connectWs('/collab/docs/doc-1');
    await waitFor(ws, (message) => message.type === 'doc.sync');

    const closePromise = waitForClose(ws);
    ws.send(JSON.stringify({ type: 'doc.update', update: 'AQID\n' }));
    expect(await waitFor(ws, (message) => message.type === 'error')).toMatchObject({
      type: 'error',
      code: 'invalid_update',
      op: 'doc.update',
    });
    expect(appendedUpdates).toHaveLength(0);
    expect(broadcasts).toHaveLength(0);
    expect(await closePromise).toEqual({ code: 1007, reason: 'Invalid document update' });
  });

  it('uses invalid-payload close semantics for malformed messages', async () => {
    const ws = await connectWs('/collab/docs/doc-1');
    await waitFor(ws, (message) => message.type === 'doc.sync');
    const closePromise = waitForClose(ws);

    ws.send(JSON.stringify({ type: 42 }));

    expect(await waitFor(ws, (message) => message.type === 'error')).toMatchObject({
      type: 'error',
      code: 'invalid_update',
      op: 'unknown',
    });
    expect(await closePromise).toEqual({ code: 1007, reason: 'Invalid collaboration message' });
  });

  it('rejects decoded updates over one MiB without appending or broadcasting', async () => {
    const ws = await connectWs('/collab/docs/doc-1');
    await waitFor(ws, (message) => message.type === 'doc.sync');
    const oversized = Buffer.alloc(MAX_DOC_UPDATE_BYTES + 1).toString('base64');

    ws.send(JSON.stringify({ type: 'doc.update', update: oversized }));
    expect(await waitFor(ws, (message) => message.type === 'error')).toMatchObject({
      type: 'error',
      code: 'update_too_large',
      op: 'doc.update',
    });
    expect(appendedUpdates).toHaveLength(0);
    expect(broadcasts).toHaveLength(0);
    ws.close();
  });

  it('keeps editing after a mismatched legacy snapshot', async () => {
    canonicalSnapshotResult = { status: 'state_mismatch', currentSeq: 0 };
    const ws = await connectWs('/collab/docs/doc-1');
    await waitFor(ws, (message) => message.type === 'doc.sync');

    ws.send(JSON.stringify({ type: 'doc.snapshot', snapshot: yUpdateBase64(), seq: 0 }));
    ws.send(JSON.stringify({ type: 'presence.update', update: 'still-connected' }));
    await waitUntil(() => broadcasts.length === 1);
    expect(JSON.parse(broadcasts[0]!.message)).toMatchObject({ type: 'presence.broadcast', update: 'still-connected' });
    expect(createdSnapshots).toHaveLength(0);
    ws.close();
  });

  it('persists current snapshots and canonical document content', async () => {
    const ws = await connectWs('/collab/docs/doc-1');
    await waitFor(ws, (message) => message.type === 'doc.sync');
    const content = [{ id: 'paragraph-1', type: 'paragraph', content: [] }];

    const snapshot = yUpdateBase64();
    ws.send(JSON.stringify({ type: 'doc.snapshot', snapshot, seq: 0, content }));
    await waitUntil(() => canonicalUpdates.length === 1);

    expect(createdSnapshots).toHaveLength(1);
    expect(createdSnapshots[0]).toMatchObject({ docId: 'doc-1', seq: 0 });
    expect(Buffer.from(createdSnapshots[0]!.snapshot).toString('base64')).toBe(snapshot);
    expect(compactedSnapshots).toEqual([{ docId: 'doc-1', seq: 0 }]);
    expect(canonicalUpdates[0]).toMatchObject({ docId: 'doc-1' });
    expect(canonicalUpdates[0]).toMatchObject({ docId: 'doc-1' });

    ws.close();
  });

  it('ignores stale client snapshots without deleting represented history', async () => {
    docLatestSeq = 2;
    docCanonicalSeq = 0;
    const ws = await connectWs('/collab/docs/doc-1');
    await waitFor(ws, (message) => message.type === 'doc.sync');

    ws.send(JSON.stringify({
      type: 'doc.snapshot',
      snapshot: yUpdateBase64(),
      seq: 1,
      content: [{ id: 'stale', type: 'paragraph', content: [] }],
    }));
    ws.send(JSON.stringify({ type: 'presence.update', update: 'after-snapshot' }));
    await waitUntil(() => broadcasts.length === 1);

    expect(createdSnapshots).toHaveLength(0);
    expect(compactedSnapshots).toHaveLength(0);
    expect(canonicalUpdates).toHaveLength(0);
    ws.close();
  });

  it('keeps editing after repeated stale snapshots', async () => {
    docLatestSeq = 2;
    docCanonicalSeq = 2;
    const ws = await connectWs('/collab/docs/doc-1');
    await waitFor(ws, (message) => message.type === 'doc.sync');

    ws.send(JSON.stringify({ type: 'doc.snapshot', snapshot: yUpdateBase64(), seq: 1 }));
    ws.send(JSON.stringify({ type: 'doc.snapshot', snapshot: yUpdateBase64(), seq: 1 }));
    const ack = waitFor(ws, (message) => message.type === 'doc.ack');
    ws.send(JSON.stringify({ type: 'doc.update', update: yUpdateBase64() }));
    expect(await ack).toMatchObject({ seq: 7 });
    expect(ws.readyState).toBe(WebSocket.OPEN);
    expect(createdSnapshots).toHaveLength(0);
    ws.close();
  });

  it('reports initial synchronization contention as retryable', async () => {
    docSyncError = new DocSyncBusyError();

    expect(await connectUntilClosed('/collab/docs/doc-1')).toEqual({
      code: 1013,
      reason: 'Document sync busy. Retry shortly.',
    });
  });

  it.each([
    [new DocSyncTooLargeError(3 * 1024 * 1024), 1009, 'Document sync state too large'],
    [new DocSyncBusyError(), 1013, 'Document sync busy. Retry shortly.'],
    [new DocNotFoundError(), 1008, 'Doc not found'],
  ] as const)('classifies current-read failure before joining: %s', async (error, code, reason) => {
    docReadError = error;
    expect(await connectUntilClosed('/collab/docs/doc-1')).toEqual({ code, reason });
    expect(joinedDocs).toBe(0);
    expect(appendedUpdates).toHaveLength(0);
  });

  it('reports oversized initial synchronization state without retrying', async () => {
    docSyncError = new DocSyncTooLargeError(3 * 1024 * 1024);

    expect(await connectUntilClosed('/collab/docs/doc-1')).toEqual({
      code: 1009,
      reason: 'Document sync state too large',
    });
  });

  it('does not misreport unexpected initial synchronization failures as access denial', async () => {
    docSyncError = new Error('database unavailable');

    expect(await connectUntilClosed('/collab/docs/doc-1')).toEqual({
      code: 1011,
      reason: 'Doc collaboration failed',
    });
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

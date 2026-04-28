import { afterAll, beforeAll, describe, expect, it, mock } from 'bun:test';
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

mock.module('../services', () => ({
  authService: { validateSession: async () => freelancerUser },
  docService: {
    getDoc: async () => ({ id: 'doc-1', projectId: 'proj-1', title: 'Test', createdBy: 'admin-1' }),
  },
  whiteboardService: {
    getWhiteboard: async () => ({ id: 'wb-1', projectId: 'proj-1', title: 'Test WB', data: null }),
  },
}));

mock.module('../repositories', () => ({
  docCollabRepository: {
    getLatestSnapshot: async () => null,
    getUpdatesSince: async () => [],
    getLatestSeq: async () => 0,
    appendUpdate: async () => 1,
    createSnapshot: async () => {},
    compactHistory: async () => {},
  },
  docRepository: { update: async () => ({}) },
  whiteboardCollabRepository: {
    getLatestSnapshot: async () => null,
    getUpdatesSince: async () => [],
    getLatestSeq: async () => 0,
    appendUpdate: async () => 1,
    createSnapshot: async () => {},
    compactHistory: async () => {},
  },
  whiteboardRepository: { update: async () => ({}) },
}));

mock.module('../collab/hub', () => ({
  docCollabHub: {
    join: () => true,
    leave: () => {},
    broadcast: () => {},
    shouldRequestSnapshot: () => false,
  },
}));

mock.module('../collab/whiteboardHub', () => ({
  whiteboardCollabHub: {
    join: () => true,
    leave: () => {},
    broadcast: () => {},
    shouldRequestSnapshot: () => false,
    listCollaborators: () => [],
  },
}));

mock.module('../collab/docSnapshot', () => ({
  resolveDocSnapshotSeq: () => 1,
  shouldPersistCanonicalDocContent: () => false,
}));

const { collab } = await import('./collab');
const { websocket } = await import('../websocket');

const app = new Hono();
app.route('/collab', collab);

let server: ReturnType<typeof Bun.serve>;
let wsBase: string;

beforeAll(() => {
  server = Bun.serve({
    port: 0,
    fetch: (req, srv) => app.fetch(req, { server: srv }),
    websocket,
  });
  wsBase = `ws://localhost:${server.port}`;
});

afterAll(() => {
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

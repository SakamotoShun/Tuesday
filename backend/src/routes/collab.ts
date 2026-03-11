import { Hono } from 'hono';
import { upgradeWebSocket } from '../websocket';
import { authService, docService, whiteboardService } from '../services';
import { docCollabRepository, whiteboardCollabRepository, whiteboardRepository } from '../repositories';
import { docCollabHub } from '../collab/hub';
import { whiteboardCollabHub } from '../collab/whiteboardHub';
import type { User } from '../types';

type CollabMessage =
  | { type: 'doc.update'; update: string }
  | { type: 'doc.snapshot'; snapshot: string }
  | { type: 'presence.update'; update: string };

type WhiteboardUpdatePayload = {
  elements: unknown[];
  files?: Record<string, unknown>;
};

type WhiteboardPresencePayload = {
  pointer?: {
    x: number;
    y: number;
    tool?: 'pointer' | 'laser';
    renderCursor?: boolean;
    laserColor?: string;
  };
  button?: 'up' | 'down';
};

type WhiteboardCollabMessage =
  | { type: 'whiteboard.update'; update: WhiteboardUpdatePayload }
  | { type: 'whiteboard.snapshot'; snapshot: WhiteboardUpdatePayload }
  | { type: 'whiteboard.presence'; update: WhiteboardPresencePayload };

const collab = new Hono();

const encodeBase64 = (data: Uint8Array) => Buffer.from(data).toString('base64');
const decodeBase64 = (data: string) => Uint8Array.from(Buffer.from(data, 'base64'));

collab.get(
  '/docs/:id',
  upgradeWebSocket((c) => {
    const docId = c.req.param('id');
    const sessionId = c.req.header('Cookie')?.match(/session_id=([^;]+)/)?.[1];
    let user: User | null = null;

    console.log(`[WS] Upgrade request for doc ${docId}, session: ${sessionId ? 'present' : 'missing'}`);

    return {
      onOpen: async (_event, ws) => {
        console.log(`[WS] Connection opened for doc ${docId}`);
        try {
          // Authenticate inside WebSocket handler
          if (!sessionId) {
            console.log(`[WS] Closing: no session`);
            ws.close(1008, 'Unauthorized');
            return;
          }
          user = await authService.validateSession(sessionId);
          if (!user) {
            console.log(`[WS] Closing: invalid session`);
            ws.close(1008, 'Unauthorized');
            return;
          }

          console.log(`[WS] User authenticated: ${user.email}`);

          const doc = await docService.getDoc(docId, user);
          if (!doc) {
            console.log(`[WS] Closing: doc not found`);
            ws.close(1008, 'Doc not found');
            return;
          }

          console.log(`[WS] Doc found: ${doc.title}, joining collab hub`);

          docCollabHub.join(docId, { ws, user });

          const snapshot = await docCollabRepository.getLatestSnapshot(docId);
          const updates = await docCollabRepository.getUpdatesSince(docId, snapshot?.seq ?? 0);
          const latestSeq = await docCollabRepository.getLatestSeq(docId);

          console.log(`[WS] Sending sync: snapshot=${!!snapshot}, updates=${updates.length}, latestSeq=${latestSeq}`);

          ws.send(
            JSON.stringify({
              type: 'doc.sync',
              snapshot: snapshot ? encodeBase64(snapshot.snapshot) : null,
              updates: updates.map((update) => encodeBase64(update.update)),
              latestSeq,
            })
          );
        } catch (err) {
          console.log(`[WS] Error in onOpen:`, err);
          ws.close(1008, 'Access denied');
        }
      },
      onMessage: async (event, ws) => {
        if (!user) return;
        
        const raw = typeof event.data === 'string' ? event.data : '';
        if (!raw) return;

        let message: CollabMessage | null = null;
        try {
          message = JSON.parse(raw) as CollabMessage;
        } catch {
          return;
        }

        if (message.type === 'doc.update') {
          const update = decodeBase64(message.update);
          const seq = await docCollabRepository.appendUpdate(docId, update, user.id);
          docCollabHub.broadcast(
            docId,
            JSON.stringify({
              type: 'doc.update',
              update: message.update,
              seq,
              actorId: user.id,
            }),
            ws
          );

          if (docCollabHub.shouldRequestSnapshot(docId, seq)) {
            ws.send(JSON.stringify({ type: 'doc.snapshot.request' }));
          }

          ws.send(JSON.stringify({ type: 'doc.ack', seq }));
          return;
        }

        if (message.type === 'presence.update') {
          docCollabHub.broadcast(
            docId,
            JSON.stringify({ type: 'presence.broadcast', update: message.update }),
            ws
          );
          return;
        }

        if (message.type === 'doc.snapshot') {
          const snapshot = decodeBase64(message.snapshot);
          const latestSeq = await docCollabRepository.getLatestSeq(docId);
          await docCollabRepository.createSnapshot(docId, snapshot, latestSeq);
        }
      },
      onClose: (_event, ws) => {
        console.log(`[WS] Connection closed for doc ${docId}`);
        docCollabHub.leave(docId, ws);
      },
    };
  })
);

collab.get(
  '/whiteboards/:id',
  upgradeWebSocket((c) => {
    const whiteboardId = c.req.param('id');
    const sessionId = c.req.header('Cookie')?.match(/session_id=([^;]+)/)?.[1];
    let user: User | null = null;

    return {
      onOpen: async (_event, ws) => {
        try {
          if (!sessionId) {
            ws.close(1008, 'Unauthorized');
            return;
          }
          user = await authService.validateSession(sessionId);
          if (!user) {
            ws.close(1008, 'Unauthorized');
            return;
          }

          const whiteboard = await whiteboardService.getWhiteboard(whiteboardId, user);
          if (!whiteboard) {
            ws.close(1008, 'Whiteboard not found');
            return;
          }

          whiteboardCollabHub.join(whiteboardId, { ws, user });

          const snapshot = await whiteboardCollabRepository.getLatestSnapshot(whiteboardId);
          const updates = await whiteboardCollabRepository.getUpdatesSince(whiteboardId, snapshot?.seq ?? 0);
          const latestSeq = await whiteboardCollabRepository.getLatestSeq(whiteboardId);
          const collaborators = whiteboardCollabHub.listCollaborators(whiteboardId).map((collaborator) => ({
            id: collaborator.id,
            name: collaborator.name,
            avatarUrl: collaborator.avatarUrl ?? undefined,
          }));

          ws.send(
            JSON.stringify({
              type: 'whiteboard.sync',
              snapshot: snapshot?.snapshot ?? whiteboard.data ?? { elements: [], files: {} },
              updates: updates.map((update) => update.update),
              latestSeq,
              collaborators,
            })
          );

          whiteboardCollabHub.broadcast(
            whiteboardId,
            JSON.stringify({
              type: 'whiteboard.join',
              collaborator: {
                id: user.id,
                name: user.name,
                avatarUrl: user.avatarUrl ?? undefined,
              },
            }),
            ws
          );
        } catch (err) {
          ws.close(1008, 'Access denied');
        }
      },
      onMessage: async (event, ws) => {
        if (!user) return;

        const raw = typeof event.data === 'string' ? event.data : '';
        if (!raw) return;

        let message: WhiteboardCollabMessage | null = null;
        try {
          message = JSON.parse(raw) as WhiteboardCollabMessage;
        } catch {
          return;
        }

        if (message.type === 'whiteboard.update') {
          if (!message.update?.elements) return;
          const seq = await whiteboardCollabRepository.appendUpdate(whiteboardId, message.update as Record<string, unknown>, user.id);
          whiteboardCollabHub.broadcast(
            whiteboardId,
            JSON.stringify({
              type: 'whiteboard.update',
              update: message.update,
              seq,
              actorId: user.id,
            }),
            ws
          );

          if (whiteboardCollabHub.shouldRequestSnapshot(whiteboardId, seq)) {
            ws.send(JSON.stringify({ type: 'whiteboard.snapshot.request' }));
          }

          ws.send(JSON.stringify({ type: 'whiteboard.ack', seq }));
          return;
        }

        if (message.type === 'whiteboard.presence') {
          whiteboardCollabHub.broadcast(
            whiteboardId,
            JSON.stringify({
              type: 'whiteboard.presence',
              user: {
                id: user.id,
                name: user.name,
                avatarUrl: user.avatarUrl ?? undefined,
              },
              update: message.update,
            }),
            ws
          );
          return;
        }

        if (message.type === 'whiteboard.snapshot') {
          const latestSeq = await whiteboardCollabRepository.getLatestSeq(whiteboardId);
          await whiteboardCollabRepository.createSnapshot(whiteboardId, message.snapshot as Record<string, unknown>, latestSeq);
          await whiteboardRepository.update(whiteboardId, { data: message.snapshot as Record<string, unknown> });
        }
      },
      onClose: (_event, ws) => {
        if (user) {
          whiteboardCollabHub.broadcast(
            whiteboardId,
            JSON.stringify({
              type: 'whiteboard.leave',
              userId: user.id,
            }),
            ws
          );
        }
        whiteboardCollabHub.leave(whiteboardId, ws);
      },
    };
  })
);

export { collab };

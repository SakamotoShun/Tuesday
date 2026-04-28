import { Hono } from 'hono';
import { upgradeWebSocket } from '../websocket';
import { authService, docService, whiteboardService } from '../services';
import { docCollabRepository, docRepository, whiteboardCollabRepository, whiteboardRepository } from '../repositories';
import { docCollabHub } from '../collab/hub';
import { resolveDocSnapshotSeq, shouldPersistCanonicalDocContent } from '../collab/docSnapshot';
import { whiteboardCollabHub } from '../collab/whiteboardHub';
import type { User } from '../types';
import { extractSearchTextFromDocContent } from '../utils/doc-search';
import { requireRouteParam } from '../utils/route-params';
import { sendWebSocketMessage, safeCloseWebSocket } from '../utils/websocket';
import { isFreelancer } from '../utils/permissions';

type CollabMessage =
  | { type: 'doc.update'; update: string }
  | { type: 'doc.snapshot'; snapshot: string; seq?: number; content?: unknown }
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
const MAX_DOC_MESSAGE_BYTES = 512 * 1024;
const MAX_WHITEBOARD_MESSAGE_BYTES = 1024 * 1024;

const encodeBase64 = (data: Uint8Array) => Buffer.from(data).toString('base64');
const decodeBase64 = (data: string) => Uint8Array.from(Buffer.from(data, 'base64'));

type ReadOnlyContext = Record<string, unknown>;

function sendReadOnlyError(
  ws: Parameters<typeof sendWebSocketMessage>[0],
  op: string,
  context: ReadOnlyContext
) {
  sendWebSocketMessage(
    ws,
    JSON.stringify({ type: 'error', code: 'read_only', op }),
    { ...context, event: 'read_only_blocked', op },
    { closeOnFailure: false }
  );
}

collab.get(
  '/docs/:id',
  upgradeWebSocket((c) => {
    const docId = requireRouteParam(c, 'id');
    const sessionId = c.req.header('Cookie')?.match(/session_id=([^;]+)/)?.[1];
    let user: User | null = null;

    return {
      onOpen: async (_event, ws) => {
        try {
          if (!sessionId) {
            safeCloseWebSocket(ws, 1008, 'Unauthorized');
            return;
          }

          user = await authService.validateSession(sessionId);
          if (!user) {
            safeCloseWebSocket(ws, 1008, 'Unauthorized');
            return;
          }

          const doc = await docService.getDoc(docId, user);
          if (!doc) {
            safeCloseWebSocket(ws, 1008, 'Doc not found');
            return;
          }

          if (!docCollabHub.join(docId, { ws, user })) {
            safeCloseWebSocket(ws, 1013, 'Room capacity reached');
            return;
          }

          const snapshot = await docCollabRepository.getLatestSnapshot(docId);
          const updates = await docCollabRepository.getUpdatesSince(docId, snapshot?.seq ?? 0);
          const latestSeq = await docCollabRepository.getLatestSeq(docId);

          sendWebSocketMessage(
            ws,
            JSON.stringify({
              type: 'doc.sync',
              snapshot: snapshot ? encodeBase64(snapshot.snapshot) : null,
              updates: updates.map((update) => encodeBase64(update.update)),
              latestSeq,
            }),
            { hub: 'doc_collab', event: 'sync', doc_id: docId, user_id: user.id }
          );
        } catch {
          safeCloseWebSocket(ws, 1008, 'Access denied');
        }
      },
      onMessage: async (event, ws) => {
        if (!user) return;

        const raw = typeof event.data === 'string' ? event.data : '';
        if (!raw) return;

        if (Buffer.byteLength(raw, 'utf8') > MAX_DOC_MESSAGE_BYTES) {
          safeCloseWebSocket(ws, 1009, 'Message too large');
          return;
        }

        let message: CollabMessage | null = null;
        try {
          message = JSON.parse(raw) as CollabMessage;
        } catch {
          return;
        }

        if (message.type === 'doc.update') {
          if (isFreelancer(user)) {
            sendReadOnlyError(ws, 'doc.update', { hub: 'doc_collab', doc_id: docId, user_id: user.id });
            return;
          }

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
            sendWebSocketMessage(ws, JSON.stringify({ type: 'doc.snapshot.request', seq }), {
              hub: 'doc_collab',
              event: 'snapshot_request',
              doc_id: docId,
              user_id: user.id,
            });
          }

          sendWebSocketMessage(ws, JSON.stringify({ type: 'doc.ack', seq }), {
            hub: 'doc_collab',
            event: 'ack',
            doc_id: docId,
            user_id: user.id,
          });
          return;
        }

        if (message.type === 'presence.update') {
          if (isFreelancer(user)) {
            sendReadOnlyError(ws, 'presence.update', { hub: 'doc_collab', doc_id: docId, user_id: user.id });
            return;
          }

          docCollabHub.broadcast(
            docId,
            JSON.stringify({ type: 'presence.broadcast', update: message.update }),
            ws
          );
          return;
        }

        if (message.type === 'doc.snapshot') {
          if (isFreelancer(user)) {
            sendReadOnlyError(ws, 'doc.snapshot', { hub: 'doc_collab', doc_id: docId, user_id: user.id });
            return;
          }

          const snapshot = decodeBase64(message.snapshot);
          const latestSeq = await docCollabRepository.getLatestSeq(docId);
          const snapshotSeq = resolveDocSnapshotSeq(message.seq, latestSeq);

          if (snapshotSeq === null) {
            return;
          }

          await docCollabRepository.createSnapshot(docId, snapshot, snapshotSeq);
          await docCollabRepository.compactHistory(docId, snapshotSeq);

          if (shouldPersistCanonicalDocContent(snapshotSeq, latestSeq, message.content)) {
            await docRepository.update(docId, {
              content: message.content,
              searchText: extractSearchTextFromDocContent(message.content),
            });
          }
        }
      },
      onClose: (_event, ws) => {
        docCollabHub.leave(docId, ws);
      },
    };
  })
);

collab.get(
  '/whiteboards/:id',
  upgradeWebSocket((c) => {
    const whiteboardId = requireRouteParam(c, 'id');
    const sessionId = c.req.header('Cookie')?.match(/session_id=([^;]+)/)?.[1];
    let user: User | null = null;

    return {
      onOpen: async (_event, ws) => {
        try {
          if (!sessionId) {
            safeCloseWebSocket(ws, 1008, 'Unauthorized');
            return;
          }
          user = await authService.validateSession(sessionId);
          if (!user) {
            safeCloseWebSocket(ws, 1008, 'Unauthorized');
            return;
          }

          const whiteboard = await whiteboardService.getWhiteboard(whiteboardId, user);
          if (!whiteboard) {
            safeCloseWebSocket(ws, 1008, 'Whiteboard not found');
            return;
          }

          if (!whiteboardCollabHub.join(whiteboardId, { ws, user })) {
            safeCloseWebSocket(ws, 1013, 'Room capacity reached');
            return;
          }

          const snapshot = await whiteboardCollabRepository.getLatestSnapshot(whiteboardId);
          const updates = await whiteboardCollabRepository.getUpdatesSince(whiteboardId, snapshot?.seq ?? 0);
          const latestSeq = await whiteboardCollabRepository.getLatestSeq(whiteboardId);
          const collaborators = whiteboardCollabHub.listCollaborators(whiteboardId).map((collaborator) => ({
            id: collaborator.id,
            name: collaborator.name,
            avatarUrl: collaborator.avatarUrl ?? undefined,
          }));

          sendWebSocketMessage(
            ws,
            JSON.stringify({
              type: 'whiteboard.sync',
              snapshot: snapshot?.snapshot ?? whiteboard.data ?? { elements: [], files: {} },
              updates: updates.map((update) => update.update),
              latestSeq,
              collaborators,
            }),
            { hub: 'whiteboard_collab', event: 'sync', whiteboard_id: whiteboardId, user_id: user.id }
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
        } catch {
          safeCloseWebSocket(ws, 1008, 'Access denied');
        }
      },
      onMessage: async (event, ws) => {
        if (!user) return;

        const raw = typeof event.data === 'string' ? event.data : '';
        if (!raw) return;

        if (Buffer.byteLength(raw, 'utf8') > MAX_WHITEBOARD_MESSAGE_BYTES) {
          safeCloseWebSocket(ws, 1009, 'Message too large');
          return;
        }

        let message: WhiteboardCollabMessage | null = null;
        try {
          message = JSON.parse(raw) as WhiteboardCollabMessage;
        } catch {
          return;
        }

        if (message.type === 'whiteboard.update') {
          if (isFreelancer(user)) {
            sendReadOnlyError(ws, 'whiteboard.update', { hub: 'whiteboard_collab', whiteboard_id: whiteboardId, user_id: user.id });
            return;
          }

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
            sendWebSocketMessage(ws, JSON.stringify({ type: 'whiteboard.snapshot.request' }), {
              hub: 'whiteboard_collab',
              event: 'snapshot_request',
              whiteboard_id: whiteboardId,
              user_id: user.id,
            });
          }

          sendWebSocketMessage(ws, JSON.stringify({ type: 'whiteboard.ack', seq }), {
            hub: 'whiteboard_collab',
            event: 'ack',
            whiteboard_id: whiteboardId,
            user_id: user.id,
          });
          return;
        }

        if (message.type === 'whiteboard.presence') {
          if (isFreelancer(user)) {
            sendReadOnlyError(ws, 'whiteboard.presence', { hub: 'whiteboard_collab', whiteboard_id: whiteboardId, user_id: user.id });
            return;
          }

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
          if (isFreelancer(user)) {
            sendReadOnlyError(ws, 'whiteboard.snapshot', { hub: 'whiteboard_collab', whiteboard_id: whiteboardId, user_id: user.id });
            return;
          }

          const latestSeq = await whiteboardCollabRepository.getLatestSeq(whiteboardId);
          await whiteboardCollabRepository.createSnapshot(whiteboardId, message.snapshot as Record<string, unknown>, latestSeq);
          await whiteboardCollabRepository.compactHistory(whiteboardId, latestSeq);
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

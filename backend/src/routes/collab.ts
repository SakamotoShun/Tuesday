import { Hono } from 'hono';
import type { WSContext } from 'hono/ws';
import { upgradeWebSocket } from '../websocket';
import {
  docCollabRepository as defaultDocCollabRepository,
  whiteboardCollabRepository as defaultWhiteboardCollabRepository,
  whiteboardRepository as defaultWhiteboardRepository,
} from '../repositories';
import { docCollabHub as defaultDocCollabHub } from '../collab/hub';
import { resolveDocSnapshotSeq } from '../collab/docSnapshot';
import { buildDocSyncState, buildWhiteboardSyncState } from '../collab/sync';
import { whiteboardCollabHub as defaultWhiteboardCollabHub } from '../collab/whiteboardHub';
import type { User } from '../types';
import { requireRouteParam } from '../utils/route-params';
import { sendWebSocketMessage, safeCloseWebSocket } from '../utils/websocket';
import { isFreelancer } from '../utils/permissions';
import { config } from '../config';
import {
  decodeStrictBase64,
  DocInvalidUpdateError,
  DocGenerationMismatchError,
  DocNotFoundError,
  DocSyncBusyError,
  DocSyncTooLargeError,
  DocUpdateTooLargeError,
  MAX_DOC_SYNC_PAYLOAD_BYTES,
  MAX_DOC_UPDATE_BYTES,
} from '../collab/docHistory';

type CollabMessage =
  | { type: 'pong'; ts?: number }
  | { type: 'doc.update'; update: string; generation?: string; operationId?: string }
  | { type: 'doc.snapshot'; snapshot: string; seq?: number; content?: unknown; generation?: string }
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
  | { type: 'pong'; ts?: number }
  | { type: 'whiteboard.update'; update: WhiteboardUpdatePayload }
  | { type: 'whiteboard.snapshot'; snapshot: WhiteboardUpdatePayload; seq: number }
  | { type: 'whiteboard.presence'; update: WhiteboardPresencePayload };

const collab = new Hono();
const MAX_DOC_MESSAGE_BYTES = Math.ceil(MAX_DOC_SYNC_PAYLOAD_BYTES / 3) * 4 + 1024;
export const MAX_WHITEBOARD_MESSAGE_BYTES = config.whiteboardMaxMessageMb * 1024 * 1024;

const encodeBase64 = (data: Uint8Array) => Buffer.from(data).toString('base64');

type ReadOnlyContext = Record<string, unknown>;

type ValidateSession = (sessionId: string) => Promise<User | null>;
type GetDoc = (docId: string, user: User) => Promise<Awaited<ReturnType<typeof import('../services/doc').docService.getDoc>>>;
type GetWhiteboard = (whiteboardId: string, user: User) => Promise<Awaited<ReturnType<typeof import('../services/whiteboard').whiteboardService.getWhiteboard>>>;

const defaultValidateSession: ValidateSession = async (sessionId) => {
  const { authService } = await import('../services/auth');
  return authService.validateSession(sessionId);
};

const defaultGetDoc: GetDoc = async (docId, user) => {
  const { docService } = await import('../services/doc');
  return docService.getDoc(docId, user);
};

const defaultGetWhiteboard: GetWhiteboard = async (whiteboardId, user) => {
  const { whiteboardService } = await import('../services/whiteboard');
  return whiteboardService.getWhiteboard(whiteboardId, user);
};

let validateSession: ValidateSession = defaultValidateSession;
let getDoc: GetDoc = defaultGetDoc;
let getWhiteboard: GetWhiteboard = defaultGetWhiteboard;
let docCollabRepository = defaultDocCollabRepository;
let whiteboardCollabRepository = defaultWhiteboardCollabRepository;
let whiteboardRepository = defaultWhiteboardRepository;
let docCollabHub = defaultDocCollabHub;
let whiteboardCollabHub = defaultWhiteboardCollabHub;

export function setCollabDependenciesForTests(deps: {
  validateSession?: ValidateSession;
  getDoc?: GetDoc;
  getWhiteboard?: GetWhiteboard;
  docCollabRepository?: typeof defaultDocCollabRepository;
  whiteboardCollabRepository?: typeof defaultWhiteboardCollabRepository;
  whiteboardRepository?: typeof defaultWhiteboardRepository;
  docCollabHub?: typeof defaultDocCollabHub;
  whiteboardCollabHub?: typeof defaultWhiteboardCollabHub;
} | null): void {
  validateSession = deps?.validateSession ?? defaultValidateSession;
  getDoc = deps?.getDoc ?? defaultGetDoc;
  getWhiteboard = deps?.getWhiteboard ?? defaultGetWhiteboard;
  docCollabRepository = deps?.docCollabRepository ?? defaultDocCollabRepository;
  whiteboardCollabRepository = deps?.whiteboardCollabRepository ?? defaultWhiteboardCollabRepository;
  whiteboardRepository = deps?.whiteboardRepository ?? defaultWhiteboardRepository;
  docCollabHub = deps?.docCollabHub ?? defaultDocCollabHub;
  whiteboardCollabHub = deps?.whiteboardCollabHub ?? defaultWhiteboardCollabHub;
}

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseDocMessage(value: unknown): CollabMessage | null {
  if (!isRecord(value) || typeof value.type !== 'string') {
    return null;
  }
  if (value.type === 'pong') {
    return value.ts === undefined || typeof value.ts === 'number' ? value as CollabMessage : null;
  }
  if (value.type === 'doc.update' || value.type === 'presence.update') {
    if (value.type === 'doc.update' && value.packet !== undefined) return null;
    if (value.type === 'doc.update' && value.operationId !== undefined
      && (typeof value.operationId !== 'string' || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value.operationId))) return null;
    return typeof value.update === 'string' ? value as CollabMessage : null;
  }
  if (value.type === 'doc.snapshot') {
    return typeof value.snapshot === 'string'
      && (value.seq === undefined || (Number.isSafeInteger(value.seq) && Number(value.seq) >= 0))
      ? value as CollabMessage
      : null;
  }
  return null;
}

function sendDocError(
  ws: Parameters<typeof sendWebSocketMessage>[0],
  docId: string,
  userId: string,
  code: 'invalid_update' | 'update_too_large' | 'resync_required',
  op: string,
): void {
  sendWebSocketMessage(
    ws,
    JSON.stringify({ type: 'error', code, op }),
    { hub: 'doc_collab', event: code, doc_id: docId, user_id: userId, op },
    { closeOnFailure: false },
  );
}

function isWhiteboardScene(value: unknown): value is WhiteboardUpdatePayload {
  if (!isRecord(value) || !Array.isArray(value.elements)) {
    return false;
  }

  if (!value.elements.every((element) => isRecord(element) && typeof element.id === 'string')) {
    return false;
  }

  return value.files === undefined || isRecord(value.files);
}

function sendInvalidWhiteboardMessage(
  ws: Parameters<typeof sendWebSocketMessage>[0],
  op: string,
  whiteboardId: string,
  userId: string
) {
  sendWebSocketMessage(
    ws,
    JSON.stringify({ type: 'error', code: 'invalid_message', op }),
    { hub: 'whiteboard_collab', event: 'invalid_message', whiteboard_id: whiteboardId, user_id: userId, op },
    { closeOnFailure: false }
  );
}

// Keep commit/broadcast/ACK and initial sync in one document order. A row lock
// alone does not order promise completion across database connections.
const docOperations = new Map<string, Promise<void>>();
function runDocOperation<T>(docId: string, operation: () => Promise<T>): Promise<T> {
  const result = (docOperations.get(docId) ?? Promise.resolve()).then(operation);
  const settled = result.then(() => {}, () => {});
  docOperations.set(docId, settled);
  void settled.then(() => {
    if (docOperations.get(docId) === settled) docOperations.delete(docId);
  });
  return result;
}

collab.get(
  '/docs/:id',
  upgradeWebSocket((c) => {
    const docId = requireRouteParam(c, 'id');
    const sessionId = c.req.header('Cookie')?.match(/session_id=([^;]+)/)?.[1];
    let user: User | null = null;
    let ready = false;
    let closed = false;
    let halted = false;
    let messageQueue = Promise.resolve();
    let queuedBytes = 0;
    let generation: string | undefined;
    const closeSocket = (ws: WSContext, code: number, reason: string) => {
      halted = true;
      closed = true;
      ready = false;
      docCollabHub.leave(docId, ws);
      safeCloseWebSocket(ws, code, reason);
    };

    return {
      onOpen: async (_event, ws) => {
        try {
          if (!sessionId) {
            closeSocket(ws, 1008, 'Unauthorized');
            return;
          }

          user = await validateSession(sessionId);
          if (closed) return;
          if (!user) {
            closeSocket(ws, 1008, 'Unauthorized');
            return;
          }

          let doc: Awaited<ReturnType<GetDoc>>;
          try {
            doc = await getDoc(docId, user);
          } catch (error) {
            if (error instanceof Error && error.message.includes('Access denied')) {
              closeSocket(ws, 1008, 'Access denied');
              return;
            }
            throw error;
          }
          if (closed) return;
          if (!doc) {
            closeSocket(ws, 1008, 'Doc not found');
            return;
          }

          await runDocOperation(docId, async () => {
            if (closed || !user) return;
            const joinResult = docCollabHub.join(docId, { ws, user, lastSeenAt: Date.now(), awaitingPong: false, pendingMessages: [] });
            if (joinResult !== 'joined') {
              const reason = joinResult === 'content_mutation'
                ? 'Document is being updated. Retry shortly.'
                : 'Room capacity reached';
              closeSocket(ws, 1013, reason);
              return;
            }

            const releaseCollabWrite = docCollabHub.beginCollabWrite(docId);
            if (!releaseCollabWrite) {
              closeSocket(ws, 1013, 'Document is being updated. Retry shortly.');
              return;
            }

            let syncState: Awaited<ReturnType<typeof buildDocSyncState>>;
            try {
              syncState = await buildDocSyncState(docCollabRepository, docId);
            } finally {
              releaseCollabWrite();
            }

            if (closed) return;
            generation = syncState.generation;
            const sent = sendWebSocketMessage(
              ws,
              JSON.stringify({
                type: 'doc.sync',
                acknowledgement: 'operation_id',
                persistence: 'server',
                snapshot: syncState.snapshot ? encodeBase64(syncState.snapshot) : null,
                updates: syncState.updates.map((update) => encodeBase64(update)),
                latestSeq: syncState.latestSeq,
                generation,
              }),
              { hub: 'doc_collab', event: 'sync', doc_id: docId, user_id: user.id }
            );
            if (!sent || !docCollabHub.finishInitialSync(docId, ws)) {
              closeSocket(ws, 1011, 'Document sync delivery failed');
              return;
            }
            ready = true;
          });
        } catch (error) {
          // Current reads can fail before buildDocSyncState. Preserve the same
          // terminal/retryable classification across the entire initial read.
          if (error instanceof DocSyncBusyError) {
            closeSocket(ws, 1013, 'Document sync busy. Retry shortly.');
          } else if (error instanceof DocSyncTooLargeError) {
            closeSocket(ws, 1009, 'Document sync state too large');
          } else if (error instanceof DocNotFoundError) {
            closeSocket(ws, 1008, 'Doc not found');
          } else {
            console.error('Doc collaboration open failed:', error);
            closeSocket(ws, 1011, 'Doc collaboration failed');
          }
        }
      },
      onMessage: (event, ws) => {
        if (!ready || closed || typeof event.data !== 'string' || !event.data) return;
        const raw = event.data;
        const bytes = Buffer.byteLength(raw, 'utf8');
        const messageLimit = MAX_DOC_MESSAGE_BYTES;
        if (bytes > messageLimit) {
          closeSocket(ws, 1009, 'Message too large');
          return;
        }
        if (queuedBytes + bytes > messageLimit * 2) {
          closeSocket(ws, 1013, 'Document update queue full. Retry shortly.');
          return;
        }
        // Admitted edits must finish even if the user navigates away before
        // their ACK. Keep content replacement blocked until this queue drains.
        const releaseQueuedOperation = docCollabHub.beginCollabWrite(docId);
        if (!releaseQueuedOperation) {
          closeSocket(ws, 1013, 'Document is being updated. Retry shortly.');
          return;
        }
        queuedBytes += bytes;
        messageQueue = messageQueue.then(() => runDocOperation(docId, async () => {
          if (halted || !user) return;

          let parsed: unknown;
          try {
            parsed = JSON.parse(raw);
          } catch {
            sendDocError(ws, docId, user.id, 'invalid_update', 'unknown');
            closeSocket(ws, 1007, 'Invalid collaboration message');
            return;
          }
          const message = parseDocMessage(parsed);
          if (!message) {
            sendDocError(ws, docId, user.id, 'invalid_update', 'unknown');
            closeSocket(ws, 1007, 'Invalid collaboration message');
            return;
          }

          try {
            if (message.type === 'pong') {
              docCollabHub.markPong(docId, ws);
              return;
            }

            docCollabHub.touch(docId, ws);
            if ((message.type === 'doc.update' || message.type === 'doc.snapshot')
              && generation !== undefined && message.generation !== generation) throw new DocGenerationMismatchError();

            if (message.type === 'doc.update') {
              if (isFreelancer(user)) {
                sendReadOnlyError(ws, 'doc.update', { hub: 'doc_collab', doc_id: docId, user_id: user.id });
                return;
              }

              const releaseCollabWrite = docCollabHub.beginCollabWrite(docId);
              if (!releaseCollabWrite) {
                closeSocket(ws, 1013, 'Document is being updated. Retry shortly.');
                return;
              }

              try {
                const update = decodeStrictBase64(message.update, MAX_DOC_UPDATE_BYTES);
                if (generation !== undefined && !message.operationId) throw new DocInvalidUpdateError('Operation identity is required');
                const currentUser = sessionId ? await validateSession(sessionId) : null;
                if (!currentUser || isFreelancer(currentUser)) { closeSocket(ws, 1008, 'Access denied'); return; }
                const seq = await docCollabRepository.appendUpdate(docId, update, user.id, {
                  generation, operationId: message.operationId, recheckAccess: true,
                });
                docCollabHub.broadcast(
                  docId,
                  JSON.stringify({ type: 'doc.update', update: message.update, seq, actorId: user.id, generation,
                    operationId: message.operationId }),
                  ws
                );
                if (!closed) {
                  sendWebSocketMessage(ws, JSON.stringify({ type: 'doc.ack', seq, generation, operationId: message.operationId }), {
                    hub: 'doc_collab',
                    event: 'ack',
                    doc_id: docId,
                    user_id: user.id,
                  });
                }
              } finally {
                releaseCollabWrite();
              }
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

              const releaseCollabWrite = docCollabHub.beginCollabWrite(docId);
              if (!releaseCollabWrite) {
                closeSocket(ws, 1013, 'Document is being updated. Retry shortly.');
                return;
              }

              try {
                const snapshot = decodeStrictBase64(message.snapshot, MAX_DOC_SYNC_PAYLOAD_BYTES);
                const latestSeq = await docCollabRepository.getLatestSeq(docId);
                const snapshotSeq = resolveDocSnapshotSeq(message.seq, latestSeq);

                if (snapshotSeq === null) {
                  sendDocError(ws, docId, user.id, 'invalid_update', 'doc.snapshot');
                  closeSocket(ws, 1007, 'Invalid document snapshot');
                  return;
                }

                if (snapshotSeq === latestSeq) {
                  const persisted = await docCollabRepository.persistCanonicalSnapshot(docId, snapshot, snapshotSeq, generation);
                  if (persisted.status === 'not_found') {
                    sendDocError(ws, docId, user.id, 'resync_required', 'doc.snapshot');
                    closeSocket(ws, 1013, 'Document resynchronization required');
                  }
                }
                // A stale checkpoint is normal contention. The next edit/flush
                // can offer a fresh one; never disconnect or spin on retries.
              } finally {
                releaseCollabWrite();
              }
            }
          } catch (error) {
            if (error instanceof Error && (error.message.includes('Access denied') || error.message.includes('Freelancers cannot'))) {
              closeSocket(ws, 1008, 'Access denied');
              return;
            }
            if (error instanceof DocInvalidUpdateError) {
              sendDocError(ws, docId, user.id, 'invalid_update', message.type);
              closeSocket(ws, 1007, 'Invalid document update');
              return;
            }
            if (error instanceof DocUpdateTooLargeError || error instanceof DocSyncTooLargeError) {
              sendDocError(ws, docId, user.id, 'update_too_large', message.type);
              closeSocket(ws, 1009, 'Document update too large');
              return;
            }
            if (error instanceof DocSyncBusyError) {
              closeSocket(ws, 1013, 'Document sync busy. Retry shortly.');
              return;
            }
            if (error instanceof DocNotFoundError || error instanceof DocGenerationMismatchError) {
              sendDocError(ws, docId, user.id, 'resync_required', message.type);
              closeSocket(ws, 1013, 'Document resynchronization required');
              return;
            }
            console.error('Doc collab message failed:', error);
            closeSocket(ws, 1011, 'Doc collaboration failed');
          }
        })).catch((error) => {
          console.error('Doc collaboration queue failed:', error);
          closeSocket(ws, 1011, 'Doc collaboration failed');
        }).finally(() => {
          queuedBytes -= bytes;
          releaseQueuedOperation();
        });
        return messageQueue;
      },
      onClose: (_event, ws) => {
        closed = true;
        ready = false;
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
          user = await validateSession(sessionId);
          if (!user) {
            safeCloseWebSocket(ws, 1008, 'Unauthorized');
            return;
          }

          const whiteboard = await getWhiteboard(whiteboardId, user);
          if (!whiteboard) {
            safeCloseWebSocket(ws, 1008, 'Whiteboard not found');
            return;
          }

          if (!whiteboardCollabHub.join(whiteboardId, { ws, user, lastSeenAt: Date.now(), awaitingPong: false })) {
            safeCloseWebSocket(ws, 1013, 'Room capacity reached');
            return;
          }

          const syncState = await buildWhiteboardSyncState(
            whiteboardCollabRepository,
            whiteboardRepository,
            whiteboardId,
            whiteboard.data
          );
          const collaborators = whiteboardCollabHub.listCollaborators(whiteboardId).map((collaborator) => ({
            id: collaborator.id,
            name: collaborator.name,
            avatarUrl: collaborator.avatarUrl ?? undefined,
          }));

          sendWebSocketMessage(
            ws,
            JSON.stringify({
              type: 'whiteboard.sync',
              snapshot: syncState.snapshot,
              updates: syncState.updates,
              latestSeq: syncState.latestSeq,
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

        try {
          if (!message || typeof message.type !== 'string') {
            sendInvalidWhiteboardMessage(ws, 'unknown', whiteboardId, user.id);
            return;
          }

          if (message.type === 'pong') {
            whiteboardCollabHub.markPong(whiteboardId, ws);
            return;
          }

          whiteboardCollabHub.touch(whiteboardId, ws);

          if (message.type === 'whiteboard.update') {
            if (isFreelancer(user)) {
              sendReadOnlyError(ws, 'whiteboard.update', { hub: 'whiteboard_collab', whiteboard_id: whiteboardId, user_id: user.id });
              return;
            }

            if (!isWhiteboardScene(message.update)) {
              sendInvalidWhiteboardMessage(ws, 'whiteboard.update', whiteboardId, user.id);
              return;
            }

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
              sendWebSocketMessage(ws, JSON.stringify({ type: 'whiteboard.snapshot.request', seq }), {
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

            if (!isWhiteboardScene(message.snapshot)) {
              sendInvalidWhiteboardMessage(ws, 'whiteboard.snapshot', whiteboardId, user.id);
              return;
            }

            const latestSeq = await whiteboardCollabRepository.getLatestSeq(whiteboardId);
            const snapshotSeq = resolveDocSnapshotSeq(message.seq, latestSeq);
            if (snapshotSeq === null) {
              sendInvalidWhiteboardMessage(ws, 'whiteboard.snapshot', whiteboardId, user.id);
              return;
            }

            await whiteboardCollabRepository.createSnapshot(whiteboardId, message.snapshot as Record<string, unknown>, snapshotSeq);
            await whiteboardCollabRepository.compactHistory(whiteboardId, snapshotSeq);
            if (snapshotSeq === latestSeq) {
              await whiteboardRepository.update(whiteboardId, { data: message.snapshot as Record<string, unknown> });
            }
            return;
          }

          sendInvalidWhiteboardMessage(ws, 'unknown', whiteboardId, user.id);
        } catch (error) {
          console.error('Whiteboard collab message failed:', error);
          whiteboardCollabHub.leave(whiteboardId, ws);
          safeCloseWebSocket(ws, 1011, 'Whiteboard collaboration failed');
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

import type { User } from '../types';
import type { WSContext } from 'hono/ws';
import { getWebSocketIdentity, safeCloseWebSocket, sendWebSocketMessage } from '../utils/websocket';

export interface CollabClient {
  ws: WSContext;
  user: User;
  lastSeenAt: number;
  awaitingPong: boolean;
  pendingMessages?: string[];
  pendingBytes?: number;
}

interface CollabRoom {
  clients: Set<CollabClient>;
  lastSnapshotRequestAt: number;
  updatesSinceSnapshotRequest: number;
}

const MAX_DOC_ROOM_CLIENTS = 20;
const HEARTBEAT_INTERVAL_MS = 30_000;
const STALE_CLIENT_TIMEOUT_MS = 90_000;

export type DocCollabJoinResult = 'joined' | 'room_full' | 'content_mutation';

export class DocCollabHub {
  private rooms = new Map<string, CollabRoom>();
  private contentMutations = new Set<string>();
  private collabWrites = new Map<string, number>();

  private getRoom(docId: string): CollabRoom {
    const existing = this.rooms.get(docId);
    if (existing) return existing;

    const room: CollabRoom = {
      clients: new Set<CollabClient>(),
      lastSnapshotRequestAt: Date.now(),
      updatesSinceSnapshotRequest: 0,
    };
    this.rooms.set(docId, room);
    return room;
  }

  join(docId: string, client: CollabClient): DocCollabJoinResult {
    if (this.contentMutations.has(docId)) {
      return 'content_mutation';
    }

    const room = this.getRoom(docId);
    if (room.clients.size >= MAX_DOC_ROOM_CLIENTS) {
      return 'room_full';
    }

    room.clients.add(client);
    return 'joined';
  }

  reserveContentMutation(docId: string): (() => void) | null {
    if (
      this.contentMutations.has(docId)
      || this.getActiveClientCount(docId) > 0
      || (this.collabWrites.get(docId) ?? 0) > 0
    ) {
      return null;
    }

    this.contentMutations.add(docId);
    let released = false;

    return () => {
      if (released) return;
      released = true;
      this.contentMutations.delete(docId);
    };
  }

  async runContentMutation<T>(docId: string, mutation: () => Promise<T>): Promise<T> {
    const release = this.reserveContentMutation(docId);
    if (!release) {
      throw new Error('Doc has active collaborators. Retry after collaborators disconnect.');
    }

    try {
      return await mutation();
    } finally {
      release();
    }
  }

  beginCollabWrite(docId: string): (() => void) | null {
    if (this.contentMutations.has(docId)) {
      return null;
    }

    this.collabWrites.set(docId, (this.collabWrites.get(docId) ?? 0) + 1);
    let released = false;

    return () => {
      if (released) return;
      released = true;
      const remaining = (this.collabWrites.get(docId) ?? 1) - 1;
      if (remaining > 0) {
        this.collabWrites.set(docId, remaining);
      } else {
        this.collabWrites.delete(docId);
      }
    };
  }

  touch(docId: string, ws: WSContext) {
    const room = this.rooms.get(docId);
    if (!room) {
      return;
    }

    for (const client of room.clients) {
      if (getWebSocketIdentity(client.ws) !== getWebSocketIdentity(ws)) {
        continue;
      }

      client.lastSeenAt = Date.now();
      client.awaitingPong = false;
      return;
    }
  }

  markPong(docId: string, ws: WSContext) {
    this.touch(docId, ws);
  }

  leave(docId: string, ws: WSContext) {
    const room = this.rooms.get(docId);
    if (!room) return;
    for (const client of room.clients) {
      if (getWebSocketIdentity(client.ws) === getWebSocketIdentity(ws)) {
        room.clients.delete(client);
        break;
      }
    }
    if (room.clients.size === 0) {
      this.rooms.delete(docId);
    }
  }

  broadcast(docId: string, message: string, exclude?: WSContext) {
    const room = this.rooms.get(docId);
    if (!room) return;

    for (const client of Array.from(room.clients)) {
      if (exclude && getWebSocketIdentity(client.ws) === getWebSocketIdentity(exclude)) continue;

      if (client.pendingMessages) {
        client.pendingBytes = (client.pendingBytes ?? 0) + Buffer.byteLength(message, 'utf8');
        if (client.pendingBytes > 4 * 1024 * 1024) {
          safeCloseWebSocket(client.ws, 1013, 'Document sync queue full. Retry shortly.');
          room.clients.delete(client);
          continue;
        }
        client.pendingMessages.push(message);
        continue;
      }

      if (!sendWebSocketMessage(client.ws, message, { hub: 'doc_collab', doc_id: docId, user_id: client.user.id })) {
        room.clients.delete(client);
      }
    }

    if (room.clients.size === 0) {
      this.rooms.delete(docId);
    }
  }

  finishInitialSync(docId: string, ws: WSContext) {
    const client = Array.from(this.rooms.get(docId)?.clients ?? []).find(
      (entry) => getWebSocketIdentity(entry.ws) === getWebSocketIdentity(ws),
    );
    if (!client) return false;
    const pending = client.pendingMessages ?? [];
    delete client.pendingMessages;
    delete client.pendingBytes;
    for (const message of pending) {
      if (!sendWebSocketMessage(client.ws, message, { hub: 'doc_collab', doc_id: docId })) {
        this.leave(docId, ws);
        return false;
      }
    }
    return true;
  }

  closeRoom(docId: string, code: number, reason: string, message?: string) {
    const room = this.rooms.get(docId);
    if (!room) return;

    const payload = message ?? JSON.stringify({ type: 'doc.deleted' });
    for (const client of room.clients) {
      sendWebSocketMessage(
        client.ws,
        payload,
        { hub: 'doc_collab', event: 'room_closed', doc_id: docId, user_id: client.user.id },
        { closeOnFailure: false }
      );
      safeCloseWebSocket(client.ws, code, reason);
    }

    this.rooms.delete(docId);
  }

  shouldRequestSnapshot(docId: string) {
    const room = this.getRoom(docId);
    const now = Date.now();
    const shouldByCount = ++room.updatesSinceSnapshotRequest >= 50;
    const shouldByTime = now - room.lastSnapshotRequestAt > 30_000;

    if (shouldByCount || shouldByTime) {
      room.lastSnapshotRequestAt = now;
      room.updatesSinceSnapshotRequest = 0;
      return true;
    }

    return false;
  }

  getActiveClientCount(docId: string) {
    return this.rooms.get(docId)?.clients.size ?? 0;
  }

  reapStaleClients(now = Date.now()) {
    for (const [docId, room] of Array.from(this.rooms.entries())) {
      for (const client of Array.from(room.clients)) {
        if (client.awaitingPong && now - client.lastSeenAt >= STALE_CLIENT_TIMEOUT_MS) {
          safeCloseWebSocket(client.ws, 1001, 'Connection timed out');
          room.clients.delete(client);
          continue;
        }

        if (client.awaitingPong || now - client.lastSeenAt < HEARTBEAT_INTERVAL_MS) {
          continue;
        }

        if (!sendWebSocketMessage(client.ws, JSON.stringify({ type: 'ping', ts: now }), {
          hub: 'doc_collab',
          event: 'heartbeat',
          doc_id: docId,
          user_id: client.user.id,
        })) {
          room.clients.delete(client);
          continue;
        }

        client.awaitingPong = true;
      }

      if (room.clients.size === 0) {
        this.rooms.delete(docId);
      }
    }
  }

  shutdown() {
    const payload = JSON.stringify({
      type: 'server.restart',
      message: 'Server is restarting. Please reconnect shortly.',
    });

    for (const room of this.rooms.values()) {
      for (const client of room.clients) {
        sendWebSocketMessage(client.ws, payload, { hub: 'doc_collab', reason: 'shutdown' }, { closeOnFailure: false });
        safeCloseWebSocket(client.ws, 1012, 'Service restarting');
      }
    }

    this.rooms.clear();
    this.contentMutations.clear();
    this.collabWrites.clear();
  }

  getStats() {
    let clients = 0;
    let awaitingPong = 0;

    for (const room of this.rooms.values()) {
      clients += room.clients.size;
      for (const client of room.clients) {
        if (client.awaitingPong) {
          awaitingPong += 1;
        }
      }
    }

    return {
      activeRooms: this.rooms.size,
      clients,
      awaitingPong,
    };
  }
}

export const docCollabHub = new DocCollabHub();

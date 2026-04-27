import type { User } from '../types';
import type { WSContext } from 'hono/ws';
import { safeCloseWebSocket, sendWebSocketMessage } from '../utils/websocket';

interface CollabClient {
  ws: WSContext;
  user: User;
}

interface CollabRoom {
  clients: Set<CollabClient>;
  lastSnapshotAt: number;
}

const MAX_DOC_ROOM_CLIENTS = 20;

class DocCollabHub {
  private rooms = new Map<string, CollabRoom>();

  private getRoom(docId: string): CollabRoom {
    const existing = this.rooms.get(docId);
    if (existing) return existing;

    const room: CollabRoom = {
      clients: new Set<CollabClient>(),
      lastSnapshotAt: Date.now(),
    };
    this.rooms.set(docId, room);
    return room;
  }

  join(docId: string, client: CollabClient) {
    const room = this.getRoom(docId);
    if (room.clients.size >= MAX_DOC_ROOM_CLIENTS) {
      return false;
    }

    room.clients.add(client);
    return true;
  }

  leave(docId: string, ws: WSContext) {
    const room = this.rooms.get(docId);
    if (!room) return;
    for (const client of room.clients) {
      if (client.ws === ws) {
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
      if (exclude && client.ws === exclude) continue;

      if (!sendWebSocketMessage(client.ws, message, { hub: 'doc_collab', doc_id: docId, user_id: client.user.id })) {
        room.clients.delete(client);
      }
    }

    if (room.clients.size === 0) {
      this.rooms.delete(docId);
    }
  }

  shouldRequestSnapshot(docId: string, seq: number) {
    const room = this.getRoom(docId);
    const now = Date.now();
    const shouldByCount = seq > 0 && seq % 50 === 0;
    const shouldByTime = now - room.lastSnapshotAt > 30_000;

    if (shouldByCount || shouldByTime) {
      room.lastSnapshotAt = now;
      return true;
    }

    return false;
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
  }

  getStats() {
    const clients = Array.from(this.rooms.values()).reduce((total, room) => total + room.clients.size, 0);
    return {
      activeRooms: this.rooms.size,
      clients,
    };
  }
}

export const docCollabHub = new DocCollabHub();

import type { User } from '../types';
import type { WSContext } from 'hono/ws';

interface CollabClient {
  ws: WSContext;
  user: User;
}

interface CollabRoom {
  clients: Set<CollabClient>;
  lastSnapshotAt: number;
}

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
    room.clients.add(client);
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

    for (const client of room.clients) {
      if (exclude && client.ws === exclude) continue;
      client.ws.send(message);
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
}

export const docCollabHub = new DocCollabHub();

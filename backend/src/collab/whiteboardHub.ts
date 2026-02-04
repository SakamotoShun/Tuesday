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

class WhiteboardCollabHub {
  private rooms = new Map<string, CollabRoom>();

  private getRoom(whiteboardId: string): CollabRoom {
    const existing = this.rooms.get(whiteboardId);
    if (existing) return existing;

    const room: CollabRoom = {
      clients: new Set<CollabClient>(),
      lastSnapshotAt: Date.now(),
    };
    this.rooms.set(whiteboardId, room);
    return room;
  }

  join(whiteboardId: string, client: CollabClient) {
    const room = this.getRoom(whiteboardId);
    room.clients.add(client);
  }

  leave(whiteboardId: string, ws: WSContext) {
    const room = this.rooms.get(whiteboardId);
    if (!room) return;
    for (const client of room.clients) {
      if (client.ws === ws) {
        room.clients.delete(client);
        break;
      }
    }
    if (room.clients.size === 0) {
      this.rooms.delete(whiteboardId);
    }
  }

  broadcast(whiteboardId: string, message: string, exclude?: WSContext) {
    const room = this.rooms.get(whiteboardId);
    if (!room) return;

    for (const client of room.clients) {
      if (exclude && client.ws === exclude) continue;
      client.ws.send(message);
    }
  }

  listCollaborators(whiteboardId: string) {
    const room = this.rooms.get(whiteboardId);
    if (!room) return [];
    return Array.from(room.clients).map((client) => client.user);
  }

  shouldRequestSnapshot(whiteboardId: string, seq: number) {
    const room = this.getRoom(whiteboardId);
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

export const whiteboardCollabHub = new WhiteboardCollabHub();

import type { User } from '../types';
import type { WSContext } from 'hono/ws';
import { sendWebSocketMessage } from '../utils/websocket';

interface CollabClient {
  ws: WSContext;
  user: User;
}

interface CollabRoom {
  clients: Set<CollabClient>;
  lastSnapshotAt: number;
}

const MAX_WHITEBOARD_ROOM_CLIENTS = 16;

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
    if (room.clients.size >= MAX_WHITEBOARD_ROOM_CLIENTS) {
      return false;
    }

    room.clients.add(client);
    return true;
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

    for (const client of Array.from(room.clients)) {
      if (exclude && client.ws === exclude) continue;

      if (!sendWebSocketMessage(client.ws, message, {
        hub: 'whiteboard_collab',
        whiteboard_id: whiteboardId,
        user_id: client.user.id,
      })) {
        room.clients.delete(client);
      }
    }

    if (room.clients.size === 0) {
      this.rooms.delete(whiteboardId);
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

  shutdown() {
    const payload = JSON.stringify({
      type: 'server.restart',
      message: 'Server is restarting. Please reconnect shortly.',
    });

    for (const room of this.rooms.values()) {
      for (const client of room.clients) {
        sendWebSocketMessage(client.ws, payload, { hub: 'whiteboard_collab', reason: 'shutdown' });
        client.ws.close(1012, 'Service restarting');
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

export const whiteboardCollabHub = new WhiteboardCollabHub();

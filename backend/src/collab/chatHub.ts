import type { User } from '../types';
import type { WSContext } from 'hono/ws';
import { safeCloseWebSocket, sendWebSocketMessage } from '../utils/websocket';

interface ChatClient {
  ws: WSContext;
  user: User;
  channelIds: Set<string>;
}

const MAX_TOTAL_CONNECTIONS = 250;
const MAX_CONNECTIONS_PER_USER = 5;
const MAX_CHANNEL_SUBSCRIPTIONS_PER_CLIENT = 100;

class ChatHub {
  private clients = new Map<string, Set<ChatClient>>();
  private channelSubscriptions = new Map<string, Set<ChatClient>>();
  private totalConnections = 0;

  private getClient(userId: string, ws: WSContext) {
    const userClients = this.clients.get(userId);
    if (!userClients) {
      return null;
    }

    for (const client of userClients) {
      if (client.ws === ws) {
        return client;
      }
    }

    return null;
  }

  private removeClient(client: ChatClient) {
    const userClients = this.clients.get(client.user.id);
    if (userClients) {
      const wasRemoved = userClients.delete(client);
      if (wasRemoved) {
        this.totalConnections = Math.max(0, this.totalConnections - 1);
      }
      if (userClients.size === 0) {
        this.clients.delete(client.user.id);
      }
    }

    for (const channelId of client.channelIds) {
      const subscribers = this.channelSubscriptions.get(channelId);
      if (!subscribers) {
        continue;
      }

      subscribers.delete(client);
      if (subscribers.size === 0) {
        this.channelSubscriptions.delete(channelId);
      }
    }
  }

  connect(ws: WSContext, user: User): ChatClient | null {
    const userClients = this.clients.get(user.id);

    if (this.totalConnections >= MAX_TOTAL_CONNECTIONS || (userClients?.size ?? 0) >= MAX_CONNECTIONS_PER_USER) {
      return null;
    }

    const client: ChatClient = {
      ws,
      user,
      channelIds: new Set(),
    };

    if (!this.clients.has(user.id)) {
      this.clients.set(user.id, new Set());
    }

    this.clients.get(user.id)!.add(client);
    this.totalConnections += 1;
    return client;
  }

  disconnect(ws: WSContext, userId: string) {
    const client = this.getClient(userId, ws);
    if (!client) return;

    this.removeClient(client);
  }

  subscribeToChannel(channelId: string, userId: string, ws: WSContext) {
    const client = this.getClient(userId, ws);
    if (!client) {
      return false;
    }

    if (!client.channelIds.has(channelId) && client.channelIds.size >= MAX_CHANNEL_SUBSCRIPTIONS_PER_CLIENT) {
      return false;
    }

    if (!this.channelSubscriptions.has(channelId)) {
      this.channelSubscriptions.set(channelId, new Set());
    }

    this.channelSubscriptions.get(channelId)!.add(client);
    client.channelIds.add(channelId);
    return true;
  }

  unsubscribeFromChannel(channelId: string, userId: string, ws?: WSContext) {
    const subscribers = this.channelSubscriptions.get(channelId);
    if (subscribers) {
      for (const client of Array.from(subscribers)) {
        if (client.user.id === userId && (!ws || client.ws === ws)) {
          subscribers.delete(client);
          client.channelIds.delete(channelId);
        }
      }

      if (subscribers.size === 0) {
        this.channelSubscriptions.delete(channelId);
      }
    }
  }

  broadcastToChannel(channelId: string, message: string, excludeUserId?: string) {
    const subscribers = this.channelSubscriptions.get(channelId);
    if (!subscribers) return;

    for (const client of Array.from(subscribers)) {
      if (excludeUserId && client.user.id === excludeUserId) continue;

      if (!sendWebSocketMessage(client.ws, message, { hub: 'chat', channel_id: channelId, user_id: client.user.id })) {
        this.removeClient(client);
      }
    }
  }

  sendToUser(userId: string, message: string) {
    const userClients = this.clients.get(userId);
    if (!userClients) return;

    for (const client of Array.from(userClients)) {
      if (!sendWebSocketMessage(client.ws, message, { hub: 'chat', user_id: userId })) {
        this.removeClient(client);
      }
    }
  }

  broadcastToAll(message: string, excludeUserId?: string) {
    for (const [userId, clients] of this.clients) {
      if (excludeUserId && userId === excludeUserId) continue;

      for (const client of Array.from(clients)) {
        if (!sendWebSocketMessage(client.ws, message, { hub: 'chat', user_id: userId })) {
          this.removeClient(client);
        }
      }
    }
  }

  getOnlineUsersInChannel(channelId: string): string[] {
    const subscribers = this.channelSubscriptions.get(channelId);
    if (!subscribers) {
      return [];
    }

    return Array.from(new Set(Array.from(subscribers).map((client) => client.user.id)));
  }

  isUserOnline(userId: string): boolean {
    return this.clients.has(userId);
  }

  shutdown() {
    const payload = JSON.stringify({
      type: 'server.restart',
      message: 'Server is restarting. Please reconnect shortly.',
    });

    for (const clients of this.clients.values()) {
      for (const client of clients) {
        sendWebSocketMessage(client.ws, payload, { hub: 'chat', reason: 'shutdown' }, { closeOnFailure: false });
        safeCloseWebSocket(client.ws, 1012, 'Service restarting');
      }
    }

    this.clients.clear();
    this.channelSubscriptions.clear();
    this.totalConnections = 0;
  }

  getStats() {
    return {
      connectedUsers: this.clients.size,
      connections: this.totalConnections,
      subscribedChannels: this.channelSubscriptions.size,
    };
  }
}

export const chatHub = new ChatHub();

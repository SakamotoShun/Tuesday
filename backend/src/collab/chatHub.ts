import type { User } from '../types';
import type { WSContext } from 'hono/ws';

interface ChatClient {
  ws: WSContext;
  user: User;
  channelIds: Set<string>;
}

class ChatHub {
  private clients = new Map<string, Set<ChatClient>>();
  private channelSubscriptions = new Map<string, Set<string>>();

  connect(ws: WSContext, user: User): ChatClient {
    const client: ChatClient = {
      ws,
      user,
      channelIds: new Set(),
    };

    if (!this.clients.has(user.id)) {
      this.clients.set(user.id, new Set());
    }
    this.clients.get(user.id)!.add(client);
    return client;
  }

  disconnect(ws: WSContext, userId: string) {
    const userClients = this.clients.get(userId);
    if (!userClients) return;

    for (const client of userClients) {
      if (client.ws === ws) {
        for (const channelId of client.channelIds) {
          this.unsubscribeFromChannel(channelId, userId);
        }
        userClients.delete(client);
        break;
      }
    }

    if (userClients.size === 0) {
      this.clients.delete(userId);
    }
  }

  subscribeToChannel(channelId: string, userId: string, ws: WSContext) {
    if (!this.channelSubscriptions.has(channelId)) {
      this.channelSubscriptions.set(channelId, new Set());
    }
    this.channelSubscriptions.get(channelId)!.add(userId);

    const userClients = this.clients.get(userId);
    if (userClients) {
      for (const client of userClients) {
        if (client.ws === ws) {
          client.channelIds.add(channelId);
          break;
        }
      }
    }
  }

  unsubscribeFromChannel(channelId: string, userId: string) {
    const channelUsers = this.channelSubscriptions.get(channelId);
    if (channelUsers) {
      channelUsers.delete(userId);
      if (channelUsers.size === 0) {
        this.channelSubscriptions.delete(channelId);
      }
    }

    const userClients = this.clients.get(userId);
    if (userClients) {
      for (const client of userClients) {
        client.channelIds.delete(channelId);
      }
    }
  }

  broadcastToChannel(channelId: string, message: string, excludeUserId?: string) {
    const channelUsers = this.channelSubscriptions.get(channelId);
    if (!channelUsers) return;

    for (const userId of channelUsers) {
      if (excludeUserId && userId === excludeUserId) continue;
      this.sendToUser(userId, message);
    }
  }

  sendToUser(userId: string, message: string) {
    const userClients = this.clients.get(userId);
    if (!userClients) return;

    for (const client of userClients) {
      try {
        client.ws.send(message);
      } catch {
        // ignore send errors
      }
    }
  }

  broadcastToAll(message: string, excludeUserId?: string) {
    for (const [userId, clients] of this.clients) {
      if (excludeUserId && userId === excludeUserId) continue;
      for (const client of clients) {
        try {
          client.ws.send(message);
        } catch {
          // ignore send errors
        }
      }
    }
  }

  getOnlineUsersInChannel(channelId: string): string[] {
    const channelUsers = this.channelSubscriptions.get(channelId);
    return channelUsers ? Array.from(channelUsers) : [];
  }

  isUserOnline(userId: string): boolean {
    return this.clients.has(userId);
  }
}

export const chatHub = new ChatHub();

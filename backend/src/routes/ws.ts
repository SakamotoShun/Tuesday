import { Hono } from 'hono';
import { upgradeWebSocket } from '../websocket';
import { authService } from '../services';
import { chatHub } from '../collab/chatHub';
import { chatService } from '../services/chat';
import type { User } from '../types';

type WSMessage =
  | { type: 'subscribe'; channelId: string }
  | { type: 'unsubscribe'; channelId: string }
  | { type: 'typing'; channelId: string; isTyping: boolean }
  | { type: 'message'; channelId: string; content: string };

const ws = new Hono();

ws.get(
  '/',
  upgradeWebSocket((c) => {
    const sessionId = c.req.header('Cookie')?.match(/session_id=([^;]+)/)?.[1];
    let user: User | null = null;

    return {
      onOpen: async (_event, socket) => {
        try {
          if (!sessionId) {
            socket.close(1008, 'Unauthorized');
            return;
          }
          user = await authService.validateSession(sessionId);
          if (!user) {
            socket.close(1008, 'Unauthorized');
            return;
          }

          chatHub.connect(socket, user);
          socket.send(JSON.stringify({ type: 'connected', userId: user.id }));
        } catch {
          socket.close(1008, 'Access denied');
        }
      },
      onMessage: async (event, socket) => {
        if (!user) return;
        const raw = typeof event.data === 'string' ? event.data : '';
        if (!raw) return;

        let message: WSMessage | null = null;
        try {
          message = JSON.parse(raw) as WSMessage;
        } catch {
          return;
        }

        if (message.type === 'subscribe') {
          try {
            const channel = await chatService.getChannel(message.channelId, user);
            if (!channel) {
              throw new Error('Channel not found');
            }
            chatHub.subscribeToChannel(message.channelId, user.id, socket);
            socket.send(JSON.stringify({ type: 'subscribed', channelId: message.channelId }));
          } catch {
            socket.send(JSON.stringify({ type: 'error', message: 'Subscription denied' }));
          }
          return;
        }

        if (message.type === 'unsubscribe') {
          chatHub.unsubscribeFromChannel(message.channelId, user.id);
          socket.send(JSON.stringify({ type: 'unsubscribed', channelId: message.channelId }));
          return;
        }

        if (message.type === 'typing') {
          await chatService.handleTyping(message.channelId, user, message.isTyping);
          return;
        }

        if (message.type === 'message') {
          try {
            await chatService.sendMessage(message.channelId, { content: message.content }, user);
          } catch {
            socket.send(JSON.stringify({ type: 'error', message: 'Message failed' }));
          }
        }
      },
      onClose: (_event, socket) => {
        if (!user) return;
        chatHub.disconnect(socket, user.id);
      },
    };
  })
);

export { ws };

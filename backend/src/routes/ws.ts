import { Hono } from 'hono';
import { upgradeWebSocket } from '../websocket';
import { authService } from '../services';
import { chatHub } from '../collab/chatHub';
import { chatService } from '../services/chat';
import type { User } from '../types';
import { sendWebSocketMessage, safeCloseWebSocket } from '../utils/websocket';

type WSMessage =
  | { type: 'subscribe'; channelId: string }
  | { type: 'unsubscribe'; channelId: string }
  | { type: 'typing'; channelId: string; isTyping: boolean }
  | { type: 'message'; channelId: string; content: string };

const ws = new Hono();
const MAX_CHAT_MESSAGE_BYTES = 64 * 1024;

ws.get(
  '/',
  upgradeWebSocket((c) => {
    const sessionId = c.req.header('Cookie')?.match(/session_id=([^;]+)/)?.[1];
    let user: User | null = null;

    return {
      onOpen: async (_event, socket) => {
        try {
          if (!sessionId) {
            safeCloseWebSocket(socket, 1008, 'Unauthorized');
            return;
          }
          user = await authService.validateSession(sessionId);
          if (!user) {
            safeCloseWebSocket(socket, 1008, 'Unauthorized');
            return;
          }

          const connection = chatHub.connect(socket, user);
          if (!connection) {
            safeCloseWebSocket(socket, 1013, 'Connection limit reached');
            return;
          }

          sendWebSocketMessage(socket, JSON.stringify({ type: 'connected', userId: user.id }), {
            hub: 'chat',
            event: 'connected',
            user_id: user.id,
          });
        } catch {
          safeCloseWebSocket(socket, 1008, 'Access denied');
        }
      },
      onMessage: async (event, socket) => {
        if (!user) return;
        const raw = typeof event.data === 'string' ? event.data : '';
        if (!raw) return;

        if (Buffer.byteLength(raw, 'utf8') > MAX_CHAT_MESSAGE_BYTES) {
          safeCloseWebSocket(socket, 1009, 'Message too large');
          return;
        }

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

            if (!chatHub.subscribeToChannel(message.channelId, user.id, socket)) {
              sendWebSocketMessage(socket, JSON.stringify({ type: 'error', message: 'Subscription limit reached' }), {
                hub: 'chat',
                event: 'subscribe_denied',
                channel_id: message.channelId,
                user_id: user.id,
              });
              return;
            }

            sendWebSocketMessage(socket, JSON.stringify({ type: 'subscribed', channelId: message.channelId }), {
              hub: 'chat',
              event: 'subscribed',
              channel_id: message.channelId,
              user_id: user.id,
            });
          } catch {
            sendWebSocketMessage(socket, JSON.stringify({ type: 'error', message: 'Subscription denied' }), {
              hub: 'chat',
              event: 'subscribe_error',
              channel_id: message.channelId,
              user_id: user.id,
            });
          }
          return;
        }

        if (message.type === 'unsubscribe') {
          chatHub.unsubscribeFromChannel(message.channelId, user.id, socket);
          sendWebSocketMessage(socket, JSON.stringify({ type: 'unsubscribed', channelId: message.channelId }), {
            hub: 'chat',
            event: 'unsubscribed',
            channel_id: message.channelId,
            user_id: user.id,
          });
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
            sendWebSocketMessage(socket, JSON.stringify({ type: 'error', message: 'Message failed' }), {
              hub: 'chat',
              event: 'message_error',
              channel_id: message.channelId,
              user_id: user.id,
            });
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

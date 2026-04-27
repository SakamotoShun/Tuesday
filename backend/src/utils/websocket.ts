import type { WSContext } from 'hono/ws';
import { log } from './logger';

export function sendWebSocketMessage(
  ws: WSContext,
  payload: string,
  context: Record<string, unknown>
) {
  try {
    const result = ws.send(payload) as number | void;

    if (typeof result === 'number' && result === -1) {
      log('warn', 'websocket.backpressure', context);
      safeCloseWebSocket(ws, 1013, 'Client too slow');
      return false;
    }

    if (typeof result === 'number' && result === 0) {
      log('warn', 'websocket.send_dropped', context);
      safeCloseWebSocket(ws, 1011, 'Connection unavailable');
      return false;
    }

    return true;
  } catch (error) {
    log('warn', 'websocket.send_failed', {
      ...context,
      error,
    });
    safeCloseWebSocket(ws, 1011, 'Connection error');
    return false;
  }
}

export function safeCloseWebSocket(ws: WSContext, code: number, reason: string) {
  try {
    ws.close(code, reason);
  } catch {
    // Ignore close failures on already-closed sockets.
  }
}

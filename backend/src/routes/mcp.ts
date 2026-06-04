import { Hono } from 'hono';
import { authenticateMcpRequest } from '../mcp/auth';
import { config } from '../config';
import { getAllTools, getTool } from '../mcp/tools';
import '../mcp/tool-definitions'; // registers tools at import time
import type { McpContext } from '../mcp/types';
import { log } from '../utils/logger';

const TUESDAY_VERSION = '1.2.0';

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id?: string | number | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

function isJsonRpcRequest(value: unknown): value is JsonRpcRequest {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function jsonRpcError(
  id: string | number | undefined | null,
  code: number,
  message: string
): JsonRpcResponse {
  return {
    jsonrpc: '2.0',
    id: id ?? null,
    error: { code, message },
  };
}

function jsonRpcResult(id: string | number | undefined | null, result: unknown): JsonRpcResponse {
  return {
    jsonrpc: '2.0',
    id: id ?? null,
    result,
  };
}

const mcp = new Hono();

function authChallenge(): string {
  if (!config.publicBaseUrl) return '';
  const origin = config.publicBaseUrl.replace(/\/+$/, '');
  return `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource"`;
}

function setAuthChallenge(c: any): void {
  const challenge = authChallenge();
  if (challenge) {
    c.header('WWW-Authenticate', challenge);
  }
}

mcp.get('/', (c) => {
  c.header('Allow', 'POST');
  return c.json(jsonRpcError(null, -32000, 'Method not allowed'), 405);
});

mcp.delete('/', (c) => {
  c.header('Allow', 'POST');
  return c.json(jsonRpcError(null, -32000, 'Method not allowed'), 405);
});

mcp.post('/', async (c) => {
  let body: JsonRpcRequest;
  try {
    const parsed = await c.req.json();
    if (!isJsonRpcRequest(parsed) || typeof parsed.method !== 'string') {
      return c.json(jsonRpcError(null, -32600, 'Invalid Request'), 400);
    }
    body = parsed;
  } catch {
    return c.json(jsonRpcError(null, -32700, 'Parse error'), 400);
  }

  if (body.jsonrpc !== '2.0') {
    return c.json(jsonRpcError(body.id, -32600, 'Invalid Request: jsonrpc must be "2.0"'), 400);
  }

  // notifications (no id) do not get a response
  const isNotification = body.id === undefined;

  try {
    switch (body.method) {
      case 'initialize': {
        const result = {
          protocolVersion: '2025-03-26',
          capabilities: { tools: {} },
          serverInfo: { name: 'Tuesday', version: TUESDAY_VERSION },
        };
        if (isNotification) return new Response(null, { status: 202 });
        return c.json(jsonRpcResult(body.id, result));
      }

      case 'notifications/initialized': {
        // No-op ack
        if (isNotification) return new Response(null, { status: 202 });
        return c.json(jsonRpcResult(body.id, {}));
      }

      case 'tools/list': {
        // Authenticate
        const auth = await authenticateMcpRequest(c.req.raw);
        if (!auth) {
          setAuthChallenge(c);
          return c.json(jsonRpcError(body.id, -32001, 'Unauthorized: invalid or missing MCP token'), 401);
        }

        const ctx: McpContext = { user: auth.user, token: auth.token };
        const allTools = getAllTools();

        // Filter tools by token scopes
        const allowedTools = allTools.filter((t) => auth.token.scopes.has(t.requiredScope));

        const toolList = allowedTools.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        }));

        return c.json(jsonRpcResult(body.id, { tools: toolList }));
      }

      case 'tools/call': {
        const auth = await authenticateMcpRequest(c.req.raw);
        if (!auth) {
          setAuthChallenge(c);
          return c.json(jsonRpcError(body.id, -32001, 'Unauthorized: invalid or missing MCP token'), 401);
        }

        const params = body.params as { name?: string; arguments?: unknown } | undefined;
        const toolName = params?.name;
        if (!toolName) {
          return c.json(jsonRpcError(body.id, -32602, 'Invalid params: tool name is required'));
        }

        const tool = getTool(toolName);
        if (!tool) {
          return c.json(jsonRpcError(body.id, -32601, `Tool not found: ${toolName}`));
        }

        // Check scope
        if (!auth.token.scopes.has(tool.requiredScope)) {
          log('warn', 'mcp.scope_denied', {
            tokenId: auth.token.tokenId,
            userId: auth.user.id,
            toolName,
            requiredScope: tool.requiredScope,
          });
          return c.json(jsonRpcError(body.id, -32002, `Scope '${tool.requiredScope}' required for tool '${toolName}'`));
        }

        const ctx: McpContext = { user: auth.user, token: auth.token };
        const startedAt = Date.now();

        try {
          const result = await tool.handler(params?.arguments ?? {}, ctx);
          const durationMs = Date.now() - startedAt;

          log('info', 'mcp.tool_call', {
            tokenId: auth.token.tokenId,
            userId: auth.user.id,
            toolName,
            ok: true,
            durationMs,
          });

          return c.json(
            jsonRpcResult(body.id, {
              content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
            })
          );
        } catch (error) {
          const durationMs = Date.now() - startedAt;
          const message = error instanceof Error ? error.message : 'Unknown error';

          log('warn', 'mcp.tool_call_failed', {
            tokenId: auth.token.tokenId,
            userId: auth.user.id,
            toolName,
            ok: false,
            durationMs,
            error: message,
          });

          return c.json(
            jsonRpcResult(body.id, {
              isError: true,
              content: [{ type: 'text', text: message }],
            })
          );
        }
      }

      default: {
        return c.json(jsonRpcError(body.id, -32601, `Method not found: ${body.method}`));
      }
    }
  } catch (error) {
    log('error', 'mcp.internal_error', { error });
    return c.json(jsonRpcError(body.id, -32603, 'Internal error'));
  }
});

export { mcp };

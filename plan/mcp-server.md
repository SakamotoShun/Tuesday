# Tuesday MCP Server Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Expose Tuesday as an MCP server so external AI agents can safely inspect and operate Tuesday projects, tasks, docs, meetings, and time entries through authenticated MCP tools.

**Architecture:** Add an authenticated HTTP MCP endpoint backed by Tuesday's existing service layer. Add API-token based auth for non-browser clients, tool scope enforcement, a small admin/user UI for token creation/revocation, and an initial safe toolset. Use existing project access rules, repositories, services, activity logging, and response semantics.

**Tech Stack:** Bun + Hono + TypeScript + Drizzle + Zod backend; React + TanStack Query + shadcn/ui frontend; MCP protocol over Streamable HTTP / JSON-RPC.

**Branch:** `feature/mcp-access`

---

## Product Definition

Tuesday should act as a tool server for agents. A user should be able to create an MCP access token, configure their agent with Tuesday's MCP endpoint, and then let that agent call tools like:

- `list_projects`
- `get_project`
- `list_project_tasks`
- `create_task`
- `update_task_status`
- `search_workspace`
- `list_project_docs`
- `get_doc`
- `create_time_entry`

The MCP server must respect the same permissions as the web app. If a user cannot see a project in Tuesday, their MCP token cannot see it either.

---

## Key Design Decisions

### 1. Transport

Use **HTTP MCP**, not stdio.

Reason:
- Tuesday is already a web app.
- External agents can connect remotely.
- No local subprocess bridge required.
- Works for hosted deployments behind reverse proxies.

Endpoint:

```text
POST /api/mcp
GET  /api/mcp  (optional, only if required by chosen transport/session model)
```

Implementation options:

1. Preferred: official TypeScript SDK `@modelcontextprotocol/sdk` if it works cleanly with Bun/Hono.
2. Fallback: implement minimal JSON-RPC MCP manually for `initialize`, `tools/list`, and `tools/call`.

The fallback is acceptable because v1 only needs tools, not resources/prompts/sampling.

### 2. Authentication

Do **not** use browser session cookies for MCP clients.

Add dedicated API tokens:

```text
Authorization: Bearer tue_mcp_<raw token>
```

Store only token hashes in DB.

Why:
- MCP clients are non-browser agents.
- Session cookies expire and are tied to browser UX.
- Tokens can be scoped, revoked, audited, and rotated.

### 3. Authorization

Every MCP request resolves to a real Tuesday user.

Tool calls reuse existing services:

- `projectService.getProjects(user)`
- `projectService.getProject(projectId, user)`
- `taskService.getProjectTasks(projectId, user)`
- `taskService.createTask(projectId, input, user)`
- `docService.getProjectDocs(projectId, user)`
- `searchService.search(user, query, limit)`

This preserves existing permission rules.

### 4. Scopes

Tokens should have scopes so users/admins can create read-only or limited-write agents.

Initial scopes:

```ts
type McpScope =
  | 'projects:read'
  | 'tasks:read'
  | 'tasks:write'
  | 'docs:read'
  | 'docs:write'
  | 'meetings:read'
  | 'meetings:write'
  | 'time:read'
  | 'time:write'
  | 'search:read'
```

V1 default recommendation:

- User-created token: read scopes + task write + time write optional.
- Admin-created token: can choose all scopes.

### 5. Audit logging

Every MCP tool call should create an audit/activity event or at minimum a structured log entry.

Minimum log fields:

- token ID
- user ID
- tool name
- success/failure
- entity IDs touched
- duration
- client IP

---

## Database Design

### New table: `mcp_tokens`

Add to `backend/src/db/schema.ts`:

```ts
export const mcpTokens = pgTable('mcp_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 100 }).notNull(),
  tokenHash: varchar('token_hash', { length: 128 }).notNull(),
  scopes: jsonb('scopes').notNull().default([]),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  tokenHashUnique: uniqueIndex('mcp_tokens_token_hash_unique').on(table.tokenHash),
  userIdx: index('mcp_tokens_user_id_idx').on(table.userId),
}));
```

### Token format

Raw token shown once:

```text
tue_mcp_<32+ bytes random base64url/hex>
```

Store:

```text
sha256(rawToken)
```

Never store or display raw token again.

---

## Backend API for Token Management

Base route:

```text
/api/v1/mcp-tokens
```

Routes:

- `GET /api/v1/mcp-tokens`
  - List current user's tokens, excluding hashes.

- `POST /api/v1/mcp-tokens`
  - Create token.
  - Body:
    ```json
    {
      "name": "Claude Desktop",
      "scopes": ["projects:read", "tasks:read", "tasks:write"],
      "expiresAt": "2026-12-31T23:59:59.000Z"
    }
    ```
  - Response includes raw token once.

- `DELETE /api/v1/mcp-tokens/:id`
  - Revoke current user's token.

- Admin later:
  - `GET /api/v1/admin/mcp-tokens`
  - `DELETE /api/v1/admin/mcp-tokens/:id`

V1 can skip admin-wide token view if we want to stay small.

---

## MCP Endpoint Design

Endpoint:

```text
/api/mcp
```

Auth header:

```http
Authorization: Bearer tue_mcp_xxx
```

### Required MCP methods for v1

- `initialize`
- `notifications/initialized` (ack/no-op)
- `tools/list`
- `tools/call`

### Server info

```json
{
  "name": "Tuesday",
  "version": "1.2.0"
}
```

### Capabilities

```json
{
  "tools": {}
}
```

Resources/prompts can be added later.

---

## Initial MCP Toolset

Keep v1 small and useful. Avoid destructive tools until audit and confirmation UX mature.

### `search_workspace`

Scope: `search:read`

Input:

```json
{
  "query": "auth bug",
  "limit": 10
}
```

Returns projects, docs, and tasks visible to the token user.

### `list_projects`

Scope: `projects:read`

Input:

```json
{
  "includeTemplates": false
}
```

Returns accessible projects.

### `get_project`

Scope: `projects:read`

Input:

```json
{
  "projectId": "uuid"
}
```

Returns one project if accessible.

### `list_project_tasks`

Scope: `tasks:read`

Input:

```json
{
  "projectId": "uuid",
  "statusId": "uuid optional",
  "assigneeId": "uuid optional"
}
```

Returns tasks in project.

### `get_task`

Scope: `tasks:read`

Input:

```json
{
  "taskId": "uuid"
}
```

Returns task details.

### `create_task`

Scope: `tasks:write`

Input:

```json
{
  "projectId": "uuid",
  "title": "Implement MCP token UI",
  "description": "optional markdown",
  "statusId": "uuid optional",
  "dueDate": "YYYY-MM-DD optional",
  "assigneeIds": ["uuid"]
}
```

Uses `taskService.createTask`.

### `update_task_status`

Scope: `tasks:write`

Input:

```json
{
  "taskId": "uuid",
  "statusId": "uuid"
}
```

Uses `taskService.updateTaskStatus`.

### `list_project_docs`

Scope: `docs:read`

Input:

```json
{
  "projectId": "uuid"
}
```

Returns docs metadata and search text summary if available. Avoid returning massive BlockNote JSON by default.

### `get_doc`

Scope: `docs:read`

Input:

```json
{
  "docId": "uuid"
}
```

Returns full doc if accessible.

### `create_time_entry`

Scope: `time:write`

Input:

```json
{
  "projectId": "uuid optional",
  "date": "YYYY-MM-DD",
  "hours": 1.5,
  "note": "Worked on MCP integration"
}
```

Uses existing `timeEntryService.upsertEntry` for the token user.

---

## MCP Tool Response Shape

Return MCP content blocks consistently:

```json
{
  "content": [
    {
      "type": "text",
      "text": "{...pretty JSON...}"
    }
  ]
}
```

For structured data, prefer JSON text in v1. Add richer MCP structured output later if client compatibility is confirmed.

Errors should become MCP tool errors, not raw stack traces:

```json
{
  "isError": true,
  "content": [
    {
      "type": "text",
      "text": "Access denied to this project"
    }
  ]
}
```

---

## Frontend UI

### Location

Add MCP token management under Profile or Admin.

Recommended v1:

- Add section in `frontend/src/pages/profile.tsx`: `MCP Access Tokens`

Why profile:
- Tokens are user-bound.
- Non-admin users may need agent access to their own workspace scope.

### UI components

- Token list:
  - name
  - scopes
  - created date
  - last used date
  - expires date
  - revoked status
  - revoke button

- Create token dialog:
  - name
  - scope checklist
  - optional expiration
  - create button

- One-time token display:
  - raw token in copyable input
  - warning: `Copy this now. It will not be shown again.`
  - example config snippets

### Example client config shown after creation

For Hermes/OpenAI/Claude-style HTTP MCP clients:

```yaml
mcp_servers:
  tuesday:
    url: "https://your-tuesday.example.com/api/mcp"
    headers:
      Authorization: "Bearer tue_mcp_..."
```

---

## Backend Implementation Tasks

### Task B1: Add MCP token schema and migration

**Objective:** Persist MCP access tokens securely.

**Files:**
- Modify: `backend/src/db/schema.ts`
- Generated migration under `backend/src/db/migrations/`

**Steps:**
1. Add `mcpTokens` table.
2. Add relation from users to tokens.
3. Generate migration.
4. Run typecheck.

**Commands:**

```bash
cd backend
bun run db:generate
bun run typecheck
```

**Commit:**

```bash
git add backend/src/db/schema.ts backend/src/db/migrations
git commit -m "feat(mcp): add MCP token schema"
```

### Task B2: Add token utility and repository

**Objective:** Generate, hash, validate, list, and revoke MCP tokens.

**Files:**
- Create: `backend/src/utils/mcp-token.ts`
- Create: `backend/src/repositories/mcpToken.ts`
- Modify: `backend/src/repositories/index.ts`
- Test: `backend/src/utils/mcp-token.test.ts`

Utility functions:

- `generateMcpToken(): string`
- `hashMcpToken(raw: string): string`
- `isMcpTokenFormat(raw: string): boolean`

Repository methods:

- `create({ userId, name, tokenHash, scopes, expiresAt })`
- `findActiveByHash(tokenHash)`
- `listByUser(userId)`
- `markUsed(id)`
- `revoke(id, userId)`

### Task B3: Add MCP token service

**Objective:** Enforce token business rules.

**Files:**
- Create: `backend/src/services/mcpToken.ts`
- Modify: `backend/src/services/index.ts`
- Test: `backend/src/services/mcpToken.test.ts`

Rules:

- Token name required.
- Scopes must be from allowed set.
- Users cannot create scopes unknown to system.
- Expired/revoked tokens cannot authenticate.
- Raw token returned once only on create.

### Task B4: Add REST routes for token management

**Objective:** Let users manage tokens from web UI.

**Files:**
- Create: `backend/src/routes/mcp-tokens.ts`
- Modify: `backend/src/routes/index.ts`
- Modify: `backend/src/utils/validation.ts`
- Test: `backend/src/routes/mcp-tokens.test.ts`

Routes:

- `GET /api/v1/mcp-tokens`
- `POST /api/v1/mcp-tokens`
- `DELETE /api/v1/mcp-tokens/:id`

### Task B5: Add MCP auth middleware/helper

**Objective:** Resolve `Authorization: Bearer` token into a Tuesday user + token scopes.

**Files:**
- Create: `backend/src/mcp/auth.ts`

Function:

```ts
export async function authenticateMcpRequest(request: Request): Promise<{
  user: User
  token: McpToken
  scopes: Set<McpScope>
}>
```

### Task B6: Add MCP protocol layer

**Objective:** Support MCP initialize, tools/list, and tools/call.

**Files:**
- Create: `backend/src/mcp/protocol.ts`
- Create: `backend/src/routes/mcp.ts`
- Modify: `backend/src/routes/index.ts`

If using SDK:
- Add dependency: `@modelcontextprotocol/sdk`
- Verify Bun compatibility.

If manual fallback:
- Parse JSON-RPC 2.0 request.
- Dispatch methods:
  - `initialize`
  - `notifications/initialized`
  - `tools/list`
  - `tools/call`
- Return JSON-RPC 2.0 responses.

### Task B7: Add MCP tool registry

**Objective:** Define tools, input schemas, scope requirements, and handlers.

**Files:**
- Create: `backend/src/mcp/tools.ts`
- Create: `backend/src/mcp/types.ts`
- Test: `backend/src/mcp/tools.test.ts`

Tool definition shape:

```ts
interface TuesdayMcpTool {
  name: string
  description: string
  requiredScope: McpScope
  inputSchema: unknown
  handler: (input: unknown, context: McpContext) => Promise<unknown>
}
```

### Task B8: Implement initial read tools

**Objective:** First useful safe tools.

Tools:
- `search_workspace`
- `list_projects`
- `get_project`
- `list_project_tasks`
- `get_task`
- `list_project_docs`
- `get_doc`

Run:

```bash
cd backend
bun test src/mcp/tools.test.ts
bun run typecheck
```

### Task B9: Implement initial write tools

**Objective:** Controlled write operations.

Tools:
- `create_task`
- `update_task_status`
- `create_time_entry`

All must:
- check scope
- reuse service layer
- respect existing permissions
- record activity/logging where relevant

### Task B10: Add audit logging

**Objective:** Track MCP usage.

Minimum v1:
- structured logs via existing logger
- update `lastUsedAt`

Optional table later:
- `mcp_tool_calls`

For v1, log:

```ts
log('info', 'mcp.tool_call', {
  tokenId,
  userId,
  toolName,
  ok,
  durationMs,
});
```

---

## Frontend Implementation Tasks

### Task F1: Add API types and client

**Files:**
- Modify: `frontend/src/api/types.ts`
- Create: `frontend/src/api/mcp-tokens.ts`

Types:

```ts
export type McpScope =
  | 'projects:read'
  | 'tasks:read'
  | 'tasks:write'
  | 'docs:read'
  | 'docs:write'
  | 'meetings:read'
  | 'meetings:write'
  | 'time:read'
  | 'time:write'
  | 'search:read'

export interface McpTokenSummary {
  id: string
  name: string
  scopes: McpScope[]
  lastUsedAt: string | null
  expiresAt: string | null
  revokedAt: string | null
  createdAt: string
}

export interface CreateMcpTokenInput {
  name: string
  scopes: McpScope[]
  expiresAt?: string | null
}

export interface CreatedMcpToken extends McpTokenSummary {
  token: string
}
```

### Task F2: Add hook

**Files:**
- Create: `frontend/src/hooks/use-mcp-tokens.ts`

Hook:

- `useMcpTokens()`
- `useCreateMcpToken()`
- `useRevokeMcpToken()`

### Task F3: Add Profile MCP section

**Files:**
- Modify: `frontend/src/pages/profile.tsx`
- Create: `frontend/src/components/profile/mcp-token-section.tsx`
- Create: `frontend/src/components/profile/create-mcp-token-dialog.tsx`

Acceptance:
- User can list tokens.
- User can create token with selected scopes.
- Raw token is displayed once with copy button.
- User can revoke token.

### Task F4: Add frontend tests/build

Commands:

```bash
cd frontend
bun run typecheck
bun test
bun run build
```

---

## Testing Strategy

### Backend unit tests

- token generation produces valid prefix and enough entropy
- token hash stable and does not equal raw token
- scope validation rejects unknown scope
- tool registry rejects missing scope
- tool handlers call existing services with correct user

### Backend route tests

- creating token returns raw token once
- list tokens never returns token hash/raw token
- revoked token cannot access MCP endpoint
- expired token cannot access MCP endpoint
- MCP `tools/list` only returns tools allowed by token scopes, or returns all tools but `tools/call` enforces scopes. Recommendation: return only allowed tools.

### Manual MCP verification

Use curl first:

```bash
curl -s https://localhost:8080/api/mcp \
  -H 'Authorization: Bearer tue_mcp_xxx' \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"curl","version":"0"}}}'
```

Then:

```bash
curl -s https://localhost:8080/api/mcp \
  -H 'Authorization: Bearer tue_mcp_xxx' \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
```

Then call:

```bash
curl -s https://localhost:8080/api/mcp \
  -H 'Authorization: Bearer tue_mcp_xxx' \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"list_projects","arguments":{}}}'
```

### Client verification

Configure Hermes/Claude-compatible MCP client:

```yaml
mcp_servers:
  tuesday:
    url: "https://your-tuesday.example.com/api/mcp"
    headers:
      Authorization: "Bearer tue_mcp_xxx"
```

Verify tools appear and can call `list_projects`.

---

## Security Considerations

- Raw tokens are shown once and never stored.
- Hash tokens with SHA-256 at minimum; HMAC with `SESSION_SECRET` is better.
- Tokens are bearer credentials. Redact them in logs.
- Scope checks must happen server-side for every tool call.
- MCP endpoint should be rate-limited separately from browser API.
- Write tools should be limited in v1; avoid delete operations.
- Tool descriptions should not leak private project names during `tools/list`.
- All tool handlers must use existing services, not direct DB queries, unless they replicate access checks exactly.

---

## Open Decisions

1. Should MCP tokens be user-created by all users, or admin-enabled per workspace?
   - Recommendation: all authenticated users can create tokens for their own permission boundary.

2. Should `tools/list` return all tools or only tools allowed by token scopes?
   - Recommendation: only return allowed tools. It reduces confusion and leakage.

3. Should write tools be enabled in v1?
   - Recommendation: yes, but only non-destructive writes: create task, update task status, create time entry.

4. Should docs write tools be included in v1?
   - Recommendation: no. BlockNote JSON is easy to corrupt. Add docs write after read tools are stable.

5. Should MCP use official SDK or minimal manual JSON-RPC?
   - Recommendation: try SDK first; use manual fallback if Bun/Hono compatibility blocks progress.

---

## Done Criteria

MCP access is done when:

- User can create/revoke MCP tokens from UI.
- Raw token is displayed once and token hash is stored only server-side.
- `/api/mcp` authenticates bearer tokens.
- `initialize`, `tools/list`, and `tools/call` work over HTTP.
- Tool calls respect existing Tuesday permissions.
- Initial read tools work: search, projects, tasks, docs.
- Initial write tools work: create task, update task status, create time entry.
- Backend typecheck/tests pass.
- Frontend typecheck/build pass.
- A real MCP client can connect and call `list_projects`.

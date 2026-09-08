# Tuesday MCP Setup

Tuesday exposes a remote MCP endpoint that can be connected to compatible AI clients.

## Endpoint

- URL: `https://tuesday.ultreonai.com/mcp`
- Legacy alias: `https://tuesday.ultreonai.com/api/mcp`
- Manual auth: `Authorization: Bearer <your-token>`
- OAuth auth: OAuth 2.1 authorization code with PKCE

Do not commit bearer tokens to the repository. Prefer environment variables or client-specific secret storage.

## OAuth connectors

Tuesday publishes OAuth discovery metadata for web-based MCP clients:

- Protected resource metadata: `https://tuesday.ultreonai.com/.well-known/oauth-protected-resource`
- Path-specific protected resource metadata: `https://tuesday.ultreonai.com/.well-known/oauth-protected-resource/mcp`
- Authorization server metadata: `https://tuesday.ultreonai.com/.well-known/oauth-authorization-server`
- Authorization endpoint: `https://tuesday.ultreonai.com/oauth/authorize`
- Token endpoint: `https://tuesday.ultreonai.com/oauth/token`
- Dynamic client registration: `https://tuesday.ultreonai.com/oauth/register`

Use OAuth for clients such as `claude.ai` web connectors that require an interactive sign-in flow. OAuth clients should request only the scopes they need.

Available scopes:

- `projects:read`
- `tasks:read`
- `tasks:write`
- `docs:read`
- `docs:write`
- `meetings:read`
- `meetings:write`
- `time:read`
- `time:write`
- `search:read`

Selecting a write scope also grants its matching read scope. This lets clients read the current resource and version before attempting an optimistic-concurrency update. Unknown OAuth scopes are rejected rather than ignored.

## Core tools

Identity tools are available to every authenticated MCP credential:

- `ping`: verify connectivity and inspect the current role and granted scopes.
- `whoami`: inspect the authenticated user ID, name, role, authentication type, and scopes.

Project and task discovery:

- `list_projects`, `get_project`, `list_project_statuses`
- `list_project_tasks`, `list_my_tasks`, `get_task`
- `list_task_statuses`, `list_project_members`

Task mutations:

- `create_task`: accepts optional `startDate`, `dueDate`, and assignee IDs. An idempotency key is required when assigning one or more users during creation; otherwise it is optional.
- `update_task_status`, `rename_task`, `update_task_description`
- `update_task_dates`: set a `YYYY-MM-DD` date, pass `null` to clear it, or omit it to leave it unchanged.
- `update_task_assignees`: atomically replaces the complete assignee set. `assign_task` remains a compatibility alias with the same replacement semantics.

Task list calls are bounded and return pagination metadata. Use `list_task_statuses` and `list_project_members` instead of guessing IDs. Every update to an existing task requires the exact positive `expectedVersion` returned by the latest `get_task` call; successful browser and MCP mutations both advance this version. Task creation does not take an expected version.

Document tools include project listing/read, creation, title updates, append, targeted block editing, and complete block replacement. `create_time_entry` currently upserts the authenticated user's entry for the same project and date; it does not append a second entry.

## Validation and errors

Tuesday validates each call against the same JSON Schema published by `tools/list`. Invalid UUIDs, impossible calendar dates, fractional or non-positive versions, duplicate assignees, unknown properties, and out-of-range values are rejected before a tool handler runs. Stale versions are rejected when the service attempts the update.

Tool failures set `isError: true` and return a stable structured error in both the compatibility text content and `structuredContent`. Callers should branch on codes such as `VALIDATION_ERROR`, `ACCESS_DENIED`, `READ_ONLY_ROLE`, `VERSION_CONFLICT`, and `IDEMPOTENCY_KEY_REUSED` rather than parsing error prose.

## Idempotency

Creation tools that accept `idempotencyKey` store the resource mutation and replay record in one database transaction for both personal tokens and OAuth. Personal-token keys are scoped to that token; OAuth keys are scoped to the user and client, so access-token refresh preserves them. Both include the tool name. Replays recheck current role, parent/project access, and access to the stored result. Reusing a key with the same canonical request returns the stored response; reusing it with changed input returns `IDEMPOTENCY_KEY_REUSED`. Records created before request hashing was introduced retain their original replay behaviour because their original input is unavailable, but still require current access to the stored result.

Keep keys at most 200 characters and identify one intended operation, for example `task:<project-id>:release-checklist:2026-08-23`. After a timeout, retry the exact same request and key instead of inventing another key.

When prompted for a connector URL, use the MCP endpoint URL: `https://tuesday.ultreonai.com/mcp`. The `/mcp` path avoids a known claude.ai connector failure after successful OAuth. Compatible clients should discover the OAuth endpoints automatically.

## Get a token

Generate or retrieve a Tuesday MCP token from the environment where you manage your Tuesday MCP access.

For local shell-based setups, export it before configuring clients:

```bash
export TUESDAY_MCP_TOKEN="your-token-here"
```

PowerShell:

```powershell
$env:TUESDAY_MCP_TOKEN="your-token-here"
```

## OpenCode

If you use OpenCode, add the MCP server to `~/.config/opencode/opencode.json`:

```json
{
  "mcp": {
    "tuesday": {
      "type": "remote",
      "url": "https://tuesday.ultreonai.com/mcp",
      "enabled": true,
      "headers": {
        "Authorization": "Bearer {env:TUESDAY_MCP_TOKEN}"
      }
    }
  }
}
```

OpenCode expands `{env:TUESDAY_MCP_TOKEN}` from the environment. Restart OpenCode after changing its configuration.

## Codex

Codex stores MCP configuration in `~/.codex/config.toml` or project-scoped `.codex/config.toml`.

```toml
[mcp_servers.tuesday]
url = "https://tuesday.ultreonai.com/mcp"
bearer_token_env_var = "TUESDAY_MCP_TOKEN"
```

After saving the config, start Codex and verify with:

```bash
codex mcp --help
```

Inside interactive Codex sessions, use `/mcp` to inspect connected servers.

## Claude Code

Add the remote HTTP MCP server with the CLI:

```bash
claude mcp add --transport http --scope user --header "Authorization: Bearer ${TUESDAY_MCP_TOKEN}" tuesday https://tuesday.ultreonai.com/mcp
```

Useful follow-up commands:

```bash
claude mcp list
claude mcp get tuesday
```

Inside Claude Code, use `/mcp` to confirm the server is connected.

## Agent skill

Connecting the MCP server makes Tuesday's tools available. Installing the companion Agent Skill separately teaches agents the safe workflows for document structure, rendered tables, targeted block edits, complete document writes, optimistic concurrency, idempotency, and retries.

The portable skill is checked into this repository at [`skills/tuesday-mcp`](../skills/tuesday-mcp/SKILL.md). Install it from the public repository with the Skills CLI:

```bash
npx skills add SakamotoShun/Tuesday --skill tuesday-mcp
```

The CLI detects supported agents and installs to the current project by default. To install the skill globally instead:

```bash
npx skills add SakamotoShun/Tuesday --skill tuesday-mcp --global
```

Use `--agent` to target a specific client, for example:

```bash
npx skills add SakamotoShun/Tuesday --skill tuesday-mcp --global --agent opencode
```

For manual installation, copy the whole `skills/tuesday-mcp` directory, including `references/documents.md`, to a location recognized by your client:

- OpenCode: `.opencode/skills/tuesday-mcp` for a project or `~/.config/opencode/skills/tuesday-mcp` globally. You can instead add this repository's `skills` directory to `skills.paths` in `opencode.json`.
- Claude Code: `.claude/skills/tuesday-mcp` for a project or `~/.claude/skills/tuesday-mcp` globally.
- Codex: `.agents/skills/tuesday-mcp` for a project or `~/.codex/skills/tuesday-mcp` globally.
- Other Agent Skills-compatible clients: use the client's project or user skills directory.

Installing the skill does not configure authentication or connect the MCP endpoint. Complete both the client connection setup above and the skill installation. Restart clients that load skills only at startup.

## Document write safety

Call `get_doc` immediately before `append_doc_blocks`, `edit_doc_blocks`, or `write_doc_blocks`, and pass its exact version. Targeted replacements and complete writes require recursive BlockNote envelopes with `id`, `type`, `props`, and `children`; partial blocks supplied to creation and append tools are normalized before storage.

Document payloads are limited to 512 KiB, 10,000 blocks, block depth 32, and JSON depth 128. MCP HTTP requests are limited to 1 MiB.

Tuesday rejects a content mutation when durable browser collaboration updates are newer than canonical document content. This preserves disconnected edits instead of deleting them. Open the document in a writable browser session to trigger canonical snapshotting, call `get_doc` again, and retry only after reassessing the current content and version.

## Claude Desktop

Tuesday should be added as a remote connector, not a local `stdio` server.

1. Open Claude Desktop.
2. Go to `Settings`.
3. Open `Connectors`.
4. Choose `Add custom connector`.
5. Enter `https://tuesday.ultreonai.com/mcp`.
6. Complete authentication with your Tuesday bearer token if prompted.

If your Claude Desktop build does not expose custom connectors, it may not support this remote HTTP MCP flow yet. In that case, use Claude Code instead.

## Security notes

- Prefer environment variables over hardcoded tokens.
- Do not commit MCP bearer tokens to git.
- Rotate tokens if they were previously pasted into shared files or chat logs.
- Use per-user tokens where possible so access can be revoked cleanly.

## Troubleshooting

- **CLI clients connect but claude.ai / Claude Desktop cannot.** Use the canonical `/mcp` URL rather than the legacy `/api/mcp` alias. Browser-based connectors send an `Origin` header (for example `https://claude.ai`). `/mcp`, `/api/mcp`, `/oauth/*`, and `/.well-known/*` deliberately accept any HTTPS origin because MCP requests authenticate with bearer tokens. A 403 `Origin not allowed` from either MCP endpoint means this exemption has regressed.
- **OAuth never starts.** `TUESDAY_BASE_URL` must be set to the public HTTPS URL; without it the `WWW-Authenticate` challenge that bootstraps connector OAuth discovery is not emitted.

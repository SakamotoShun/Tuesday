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

Connecting the MCP server makes Tuesday's tools available. Installing the companion Agent Skill separately teaches agents the safe workflows for document structure, rendered tables, optimistic concurrency, idempotency, and retries.

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

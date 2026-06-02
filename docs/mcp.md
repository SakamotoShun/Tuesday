# Tuesday MCP Setup

Tuesday exposes a remote MCP endpoint that can be connected to compatible AI clients.

## Endpoint

- URL: `https://tuesday.ultreonai.com/api/mcp`
- Auth: `Authorization: Bearer <your-token>`

Do not commit bearer tokens to the repository. Prefer environment variables or client-specific secret storage.

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
      "url": "https://tuesday.ultreonai.com/api/mcp",
      "enabled": true,
      "headers": {
        "Authorization": "Bearer ${TUESDAY_MCP_TOKEN}"
      }
    }
  }
}
```

If your OpenCode install does not expand environment variables in JSON values, replace the placeholder with the token directly and keep that file out of version control.

## Codex

Codex stores MCP configuration in `~/.codex/config.toml` or project-scoped `.codex/config.toml`.

```toml
[mcp_servers.tuesday]
url = "https://tuesday.ultreonai.com/api/mcp"
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
claude mcp add --transport http --scope user --header "Authorization: Bearer ${TUESDAY_MCP_TOKEN}" tuesday https://tuesday.ultreonai.com/api/mcp
```

Useful follow-up commands:

```bash
claude mcp list
claude mcp get tuesday
```

Inside Claude Code, use `/mcp` to confirm the server is connected.

## Claude Desktop

Tuesday should be added as a remote connector, not a local `stdio` server.

1. Open Claude Desktop.
2. Go to `Settings`.
3. Open `Connectors`.
4. Choose `Add custom connector`.
5. Enter `https://tuesday.ultreonai.com/api/mcp`.
6. Complete authentication with your Tuesday bearer token if prompted.

If your Claude Desktop build does not expose custom connectors, it may not support this remote HTTP MCP flow yet. In that case, use Claude Code instead.

## Security notes

- Prefer environment variables over hardcoded tokens.
- Do not commit MCP bearer tokens to git.
- Rotate tokens if they were previously pasted into shared files or chat logs.
- Use per-user tokens where possible so access can be revoked cleanly.

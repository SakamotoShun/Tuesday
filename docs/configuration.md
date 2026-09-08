# Configuration Reference

Tuesday is configured via environment variables. Development has sensible defaults; production requires explicit `TUESDAY_BASE_URL` and `CORS_ORIGIN` values.

## Server

| Variable | Default | Description |
|----------|---------|-------------|
| `TUESDAY_PORT` | `7002` | Host port to expose (used in docker-compose.yml) |
| `TUESDAY_BASE_URL` | `http://localhost:7002` | Public URL for the instance, used for links and same-origin checks behind proxies |
| `PORT` | `8080` | Internal server listening port |
| `NODE_ENV` | `production` | Environment mode (`development`, `production`, `test`) |

## Database

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgresql://tuesday:tuesday@localhost:5432/tuesday` | PostgreSQL connection string. Auto-configured for the embedded database. |

## Security

| Variable | Default | Description |
|----------|---------|-------------|
| `SESSION_SECRET` | Auto-generated | Secret for signing session cookies. Generated on first run and stored in `/app/data/.session_secret`. Provide your own for multi-instance or reproducible deployments. Must be at least 32 characters. |
| `SESSION_DURATION_HOURS` | `24` | Session expiry time in hours (1-720). |
| `RATE_LIMIT_ENABLED` | `true` | Enable rate limiting on auth and API endpoints. |

## Notification Email Delivery

Notification emails are opt-in at both workspace and user level. SMTP is configured in Developer Settings. Non-implicit SMTP connections require STARTTLS; plaintext fallback is not allowed.

| Variable | Default | Description |
|----------|---------|-------------|
| `EMAIL_WORKER_POLL_INTERVAL_MS` | `1000` | Delay between durable delivery queue polls. |
| `EMAIL_WORKER_BATCH_SIZE` | `10` | Maximum deliveries leased per poll. |
| `EMAIL_WORKER_LEASE_MS` | `60000` | Delivery lease duration. Must exceed the bounded SMTP operation. |
| `EMAIL_WORKER_DRAIN_TIMEOUT_MS` | `60000` | Shutdown time allowed for the active SMTP delivery. Must cover the configured SMTP timeouts plus 10 seconds. |
| `SMTP_CONNECTION_TIMEOUT_MS` | `10000` | SMTP connection timeout. |
| `SMTP_GREETING_TIMEOUT_MS` | `10000` | SMTP greeting timeout. |
| `SMTP_SOCKET_TIMEOUT_MS` | `30000` | SMTP socket inactivity timeout. |

The three SMTP timeout values may total at most 50000 ms. This keeps one active send within the 60000 ms lease and drain ceiling used by the packaged process supervisor.

## File Uploads

| Variable | Default | Description |
|----------|---------|-------------|
| `UPLOAD_MAX_SIZE_MB` | `10` | Maximum file upload size in megabytes (1-100). |
| `UPLOAD_STORAGE_PATH` | `/app/data/uploads` | Directory for uploaded files. |
| `UPLOAD_ALLOWED_TYPES` | `image/*,application/pdf,text/plain,text/markdown` | Comma-separated list of allowed MIME types. Supports wildcards (e.g. `image/*`). |
| `UPLOAD_PENDING_TTL_MINUTES` | `30` | Minutes before unattached uploads are automatically deleted (1-1440). |
| `DELETED_MESSAGE_FILE_RETENTION_DAYS` | `30` | Days to keep files from deleted messages before cleanup (1-365). |

## Whiteboards

| Variable | Default | Description |
|----------|---------|-------------|
| `WHITEBOARD_MAX_MESSAGE_MB` | `10` | Maximum whiteboard WebSocket message size in megabytes (1-50). Increase cautiously because pasted images are embedded in scene messages. |

## CORS

| Variable | Default | Description |
|----------|---------|-------------|
| `CORS_ORIGIN` | `http://localhost:5173` | Allowed browser origin. Development adds localhost automatically; production must set this explicitly, including single-container deployments. |

## Advanced

| Variable | Default | Description |
|----------|---------|-------------|
| `DATA_DIR` | `/app/data` | Root data directory for PostgreSQL data, uploads, and secrets. |
| `STATIC_DIR` | _(empty)_ | Directory containing frontend build files. Set to `/app/static` in the Docker image. Leave empty to disable static serving (development mode). |
| `TRUSTED_PROXY_HOPS` | `1` | When `TRUST_PROXY=true`, number of trusted proxy hops to skip from the right side of `X-Forwarded-For` before choosing the client IP. |

## Docker-Specific

These are set automatically in the Docker image and generally should not be changed:

| Variable | Value | Description |
|----------|-------|-------------|
| `NODE_ENV` | `production` | Set in supervisord.conf |
| `STATIC_DIR` | `/app/static` | Set in supervisord.conf |
| `UPLOAD_STORAGE_PATH` | `/app/data/uploads` | Set in supervisord.conf |
| `DATABASE_URL` | `postgresql://tuesday:tuesday@localhost:5432/tuesday` | Set in entrypoint.sh |

For production images, always pass `CORS_ORIGIN`. Use the same value as `TUESDAY_BASE_URL` for the single-container deployment.

## MCP clients

Tuesday can also be consumed from MCP-compatible AI clients. For remote MCP setup instructions for OpenCode, Codex, Claude Code, and Claude Desktop, see [Tuesday MCP Setup](mcp.md).

## Example `.env` File

```env
# Minimal production configuration
TUESDAY_PORT=7002
TUESDAY_BASE_URL=https://tuesday.example.com
CORS_ORIGIN=https://tuesday.example.com
TUESDAY_IMAGE=ghcr.io/sakamotoshun/tuesday@sha256:<release-digest>
```

Use a release digest or a controlled version tag for `TUESDAY_IMAGE`. Automatic Watchtower updates are intentionally not included because database migrations require a verified backup and explicit rollout.

For the full template, see `.env.example` in the repository root.

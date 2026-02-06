# Configuration Reference

Tuesday is configured via environment variables. All settings have sensible defaults for Docker deployment.

## Server

| Variable | Default | Description |
|----------|---------|-------------|
| `TUESDAY_PORT` | `8080` | Host port to expose (used in docker-compose.yml) |
| `TUESDAY_BASE_URL` | `http://localhost:8080` | Public URL for the instance |
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

## File Uploads

| Variable | Default | Description |
|----------|---------|-------------|
| `UPLOAD_MAX_SIZE_MB` | `10` | Maximum file upload size in megabytes (1-100). |
| `UPLOAD_STORAGE_PATH` | `/app/data/uploads` | Directory for uploaded files. |
| `UPLOAD_ALLOWED_TYPES` | `image/*,application/pdf,text/plain,text/markdown` | Comma-separated list of allowed MIME types. Supports wildcards (e.g. `image/*`). |
| `UPLOAD_PENDING_TTL_MINUTES` | `30` | Minutes before unattached uploads are automatically deleted (1-1440). |
| `DELETED_MESSAGE_FILE_RETENTION_DAYS` | `30` | Days to keep files from deleted messages before cleanup (1-365). |

## CORS

| Variable | Default | Description |
|----------|---------|-------------|
| `CORS_ORIGIN` | `http://localhost:5173` | Allowed CORS origin. Not needed in Docker (same-origin). Only set for separate frontend/backend development. |

## Advanced

| Variable | Default | Description |
|----------|---------|-------------|
| `DATA_DIR` | `/app/data` | Root data directory for PostgreSQL data, uploads, and secrets. |
| `STATIC_DIR` | _(empty)_ | Directory containing frontend build files. Set to `/app/static` in the Docker image. Leave empty to disable static serving (development mode). |

## Docker-Specific

These are set automatically in the Docker image and generally should not be changed:

| Variable | Value | Description |
|----------|-------|-------------|
| `NODE_ENV` | `production` | Set in supervisord.conf |
| `STATIC_DIR` | `/app/static` | Set in supervisord.conf |
| `UPLOAD_STORAGE_PATH` | `/app/data/uploads` | Set in supervisord.conf |
| `CORS_ORIGIN` | `http://localhost:8080` | Set in supervisord.conf (same-origin) |
| `DATABASE_URL` | `postgresql://tuesday:tuesday@localhost:5432/tuesday` | Set in entrypoint.sh |

## Example `.env` File

```env
# Minimal production configuration
TUESDAY_PORT=8080
TUESDAY_BASE_URL=https://tuesday.example.com
```

For the full template, see `.env.example` in the repository root.

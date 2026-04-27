# Tuesday Runbook

## Baseline checks

- Verify liveness: `curl -fsS http://127.0.0.1:8080/health`
- Verify readiness: `curl -fsS http://127.0.0.1:8080/ready`
- Verify setup endpoint: `curl -fsS http://127.0.0.1:8080/api/v1/setup/status`
- Inspect container logs: `docker logs -f tuesday`
- Inspect runtime diagnostics as an admin: `GET /api/v1/admin/diagnostics`

## Standard deployment

1. Pull the new image.
2. Stop the current container.
3. Start the new container with the existing `/app/data` volume.
4. Wait for `/ready` to return `200`.
5. Verify the homepage and setup status endpoint.

The backend runs migrations at boot and will fail fast if a migration cannot be applied.

## Backups and restores

- Create a backup archive: `./scripts/backup.sh`
- Restore a backup archive: `./scripts/restore.sh /path/to/backup.tar.gz --yes`
- Verify a backup archive: `./scripts/backup-verify.sh /path/to/backup.tar.gz`

Backups include both PostgreSQL data and uploaded files. Treat the archive as sensitive.

## Common incidents

### `/health` is healthy but `/ready` fails

- Check PostgreSQL connectivity.
- Check that the upload directory is writable.
- Check whether all migrations were applied.
- Review structured logs for `migration.*`, `cleanup.*`, or `server.start_failed` entries.

### Requests return `429`

- Confirm whether `RATE_LIMIT_ENABLED` is on.
- Check `RATE_LIMIT_BACKEND` (`memory` or `postgres`).
- If the PostgreSQL backend is enabled, confirm the app can access the `rate_limit_entries` table.
- For auth and setup endpoints, confirm the reverse proxy forwards a real client IP.

### WebSocket clients disconnect or stop receiving updates

- Check `GET /api/v1/admin/diagnostics` for websocket room counts.
- Review logs for `websocket.backpressure`, `websocket.send_failed`, and `websocket.send_dropped`.
- Confirm the client is not exceeding room capacity or sending oversized messages.

### Backups succeed but restore fails

- Re-run `./scripts/backup-verify.sh` against the archive.
- Confirm the archive contains both the database dump and uploads directory.
- Confirm the target instance is stopped before restoring.

## Local verification commands

- Backend checks: `cd backend && bun run typecheck && bun test && bun run lint && bun run build`
- Frontend checks: `cd frontend && bunx tsc --noEmit && bun test && bun run lint && bun run build`
- Docker smoke build: `docker build -t tuesday-local:dev .`

## Integration test database

- Start the ephemeral test database: `docker compose -f backend/docker-compose.test.yml up -d`
- Run backend tests with DB coverage:
  `cd backend && DATABASE_URL=postgresql://tuesday_test:test_password@127.0.0.1:5433/tuesday_test RUN_DB_INTEGRATION_TESTS=true bun test`
- Stop the test database: `docker compose -f backend/docker-compose.test.yml down -v`

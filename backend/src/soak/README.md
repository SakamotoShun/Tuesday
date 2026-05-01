# Memory Soak Runner

Run the soak runner from the backend workspace:

```bash
bun run soak:memory --scenario mixed --clients 50
```

Useful flags:

- `--scenario chat|doc|whiteboard|mixed`
- `--clients 50`
- `--warmup 5m`
- `--active 20m`
- `--idle 10m`
- `--recovery 10m`
- `--sample 15s`
- `--seed-history 250`
- `--start-db`
- `--start-backend`
- `--quiet`
- `--verbose`
- `--log-json`

The runner writes:

- `diagnostics.ndjson`
- `summary.json`
- `report.md`
- `manifest.json`

under `soak-results/<timestamp>/` by default when you run the command from `backend/`.

Recommended from `backend/`:

```text
soak-results/<timestamp>/
```

If you need an absolute filesystem path, it must include the leading `/`:

```text
/root/Repository/Tuesday/backend/soak-results/<timestamp>/
```

Resources are cleaned up automatically on success and failure.

During the run, the CLI prints live status lines including:

- current phase
- process RSS and heap usage
- event loop p95
- host CPU usage
- host memory usage and available memory
- load average
- websocket room/client counts
- awaiting-pong totals

If a run is interrupted, use the cleanup command:

```bash
bun run soak:cleanup --manifest soak-results/<timestamp>/manifest.json
```

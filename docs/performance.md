# Tuesday Performance Notes

## Current approach

- The backend is compiled into a standalone Bun binary for production.
- PostgreSQL remains embedded in the deployment container and is the only required datastore.
- Structured logs and admin diagnostics are the primary observability surfaces.
- Heavy frontend routes are lazy loaded to keep the initial shell small.

## Runtime guardrails

- Session validation uses a short in-process cache to reduce repeated lookups.
- Hot-path database indexes cover messages, time entries, tasks, and meetings.
- WebSocket rooms enforce modest capacity limits and close slow consumers under back-pressure.
- Collaboration snapshots compact older updates so sync cost does not grow without bound.
- Rate limiting can run in memory or in PostgreSQL depending on deployment needs.

## Expected capacity profile

- Single-instance deployment.
- Modest concurrent team usage.
- Docs, whiteboards, and chat are optimized for small-to-medium active rooms rather than large fan-out workloads.

## Profiling checklist

1. Check `/api/v1/admin/diagnostics` for memory usage, event loop delay, cleanup timings, and websocket counts.
2. Review structured logs for repeated slow or failing paths.
3. Confirm `/ready` stays healthy during startup, deploy, and restart cycles.
4. Rebuild the frontend with `ANALYZE=1 bun run build` to inspect chunk composition.
5. Re-run bundle budgets with `bun run size`.

## Likely hotspots

- Rich document editing and whiteboard sessions.
- Large lazy frontend chunks from editors and diagram tooling.
- Burst traffic on auth endpoints if client IP forwarding is misconfigured.
- Upload-heavy chat or hiring workflows.

## Tuning guidance

- Prefer the PostgreSQL rate-limit backend when running multiple app processes.
- Keep reverse-proxy client IP forwarding correct so rate limiting and logs stay accurate.
- Monitor the upload volume size and backup time as file usage grows.
- Keep docs and whiteboards behind the existing room caps unless there is measured demand to raise them.

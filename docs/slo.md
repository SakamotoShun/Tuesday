# Tuesday SLOs

## Scope

These targets cover the single-instance self-hosted deployment that ships with Tuesday.

## Availability objectives

- Monthly availability target for `/health`: 99.9%
- Monthly availability target for `/ready`: 99.5%
- Monthly availability target for authenticated API requests: 99.5%

## Latency objectives

- `GET /health`: p95 under 250 ms
- `GET /ready`: p95 under 1000 ms
- Standard authenticated API requests: p95 under 1000 ms
- WebSocket connect and initial sync for normal-sized rooms: p95 under 3000 ms

## Data durability objectives

- Daily successful backup verification
- Recovery procedure tested against current backup format
- No silent loss of attached uploads during backup or restore

## Error budget use

Spend the error budget on:

- Planned upgrades and migration windows
- Security fixes
- Performance work that requires restarts or image churn

Avoid spending the error budget on:

- Unverified release candidates
- Schema changes without restore validation
- Proxy changes that remove client IP forwarding

## Operational signals

- `/health` and `/ready`
- Structured logs
- `GET /api/v1/admin/diagnostics`
- Backup verification results
- CI status for tests, smoke deploy, Trivy, and CodeQL

## Review cadence

- Review SLO performance monthly.
- Review after every significant incident.
- Revisit room limits, bundle budgets, and backup timing after major feature additions.

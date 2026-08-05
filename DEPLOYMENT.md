# Deployment

## Phase 0 Local Prerequisites

- Docker Engine with Docker Compose v2

## Start the Stack

```sh
docker compose up --build
```

The Nginx entry point listens on `http://localhost:8080` by default. Copy `.env.example` to `.env` only when changing the documented defaults.

## Health Verification

```sh
curl http://localhost:8080/api/health
```

The response reports `status: "healthy"` and `database: "connected"` when PostgreSQL is reachable.

## Database Startup and Reset

The server applies Drizzle migrations and runs the idempotent seed before accepting requests. The database is created by Docker Compose; the server reads its connection only from `DATABASE_URL`.

To reset local database data and rerun migration/seed startup, remove only the ElectriFix Compose volume and start the stack again:

```sh
docker compose down --volumes
docker compose up --build
```

For a separate test database, set `TEST_DATABASE_URL` and run the server test suite. That database must be dedicated to tests.

## Simulator Troubleshooting

- If a simulator request returns `404`, fetch `/api/simulator/scenarios` and use a listed feeder, DT, or device-equipped pole ID.
- A `409` response means a simulation for that target is still admitting telemetry. Wait for completion before retrying.
- A `422` response means the requested scenario is invalid, such as a span fault on fallback topology or non-adjacent span poles.
- Fault and repair simulations return `202` after telemetry admission begins. Fault localization and ticket verification continue through the normal asynchronous production workflow.

## API Troubleshooting

- List endpoints use opaque cursor pagination. Reuse only the `next_cursor` returned by the preceding response.
- A `400` response indicates malformed input or an invalid query parameter; a `422` response indicates a valid request that violates a documented business rule.
- Ticket lifecycle commands return `409` when the current ticket status cannot transition through the requested action.
- `GET /api/config` exposes effective runtime policies in the public API representation; configuration environment variables remain server-side only.

## WebSocket Troubleshooting

- Connect to `ws://localhost:8080/ws` locally. When TLS terminates in front of Nginx, use `wss://`.
- Nginx proxies `/ws` with the required HTTP upgrade headers. Rebuild the stack after dependency or proxy changes with `docker compose up --build`.
- WebSocket delivery is at-most-once and has no replay. After every successful connection, the client must re-fetch `GET /api/dashboard/summary` and `GET /api/tickets?status=open`.
- While a WebSocket connection is unavailable, client screens should use their REST polling fallback. REST remains authoritative in both modes.

## Optional AI Summaries

The OpenRouter integration is disabled unless `AI_SUMMARIES_ENABLED=true`. Set `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, and optionally `OPENROUTER_BASE_URL` and `AI_SUMMARY_TIMEOUT_MS` (default `5000`). Do not commit the API key. A missing key, timeout, provider error, or malformed response leaves `ai_summary` as `null`; the application remains fully operational.

## Phase 0 Troubleshooting

- If port 8080 is already in use, set `APP_PORT` in `.env` to an available port.
- If the health endpoint returns `503`, wait for the PostgreSQL health check to pass and retry.
- Rebuild after dependency changes with `docker compose up --build`.

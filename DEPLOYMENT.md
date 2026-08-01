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

## Phase 0 Troubleshooting

- If port 8080 is already in use, set `APP_PORT` in `.env` to an available port.
- If the health endpoint returns `503`, wait for the PostgreSQL health check to pass and retry.
- Rebuild after dependency changes with `docker compose up --build`.

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

## Phase 0 Troubleshooting

- If port 8080 is already in use, set `APP_PORT` in `.env` to an available port.
- If the health endpoint returns `503`, wait for the PostgreSQL health check to pass and retry.
- Rebuild after dependency changes with `docker compose up --build`.

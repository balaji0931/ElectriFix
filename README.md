# ElectriFix

ElectriFix is an operator console for detecting and managing electricity distribution faults. Phase 1 adds an automatically migrated and seeded PostgreSQL database; feature documentation will be completed in Phase 19.

## Local Startup

With Docker installed, run:

```sh
docker compose up --build
```

Open `http://localhost:8080` for the client shell. Verify the server at `http://localhost:8080/api/health`.

Startup applies pending database migrations and idempotently seeds five feeders, 60 DTs, 4,000 poles, initialized pole states, and relative-time scheduled outages.

See `DEPLOYMENT.md` for prerequisites and Phase 0 troubleshooting.

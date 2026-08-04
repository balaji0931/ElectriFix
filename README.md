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

## Simulator

The simulator submits synthetic telemetry through the production ingestion pipeline; it never creates faults or tickets directly.

```sh
curl http://localhost:8080/api/simulator/scenarios
curl -X POST http://localhost:8080/api/simulator/inject-fault \
  -H 'Content-Type: application/json' \
  -d '{"fault_type":"dt","target_id":"D-0001"}'
curl -X POST http://localhost:8080/api/simulator/inject-noise \
  -H 'Content-Type: application/json' \
  -d '{"noise_type":"duplicate_telemetry","target_pole_id":"P-000001"}'
```

After a fault is localized, repair it with its fault UUID:

```sh
curl -X POST http://localhost:8080/api/simulator/repair \
  -H 'Content-Type: application/json' \
  -d '{"fault_id":"<fault-id>"}'
```

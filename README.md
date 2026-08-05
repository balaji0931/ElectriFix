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

## API

The backend REST contract is documented in [API-SPECIFICATION.md](API-SPECIFICATION.md). It includes fault and ticket views, ticket lifecycle commands, current pole state, registry topology, scheduled outages, dashboard summary, and runtime product policies.

## Operator Console

Open `http://localhost:8080` to use the reviewer-facing operator console. The
dashboard presents active faults, current ticket workflow, localized evidence,
and a DT-scoped network map. It makes topology source and confidence visible:

- Recorded topology is shown as a solid network path.
- Inferred topology is reserved for a distinct dashed treatment when available.
- Fallback topology is shown as a DT area and never as an exact fault span.

Select a fault to inspect its last live pole, first dark pole, affected-pole
count, PIN code, confidence reasons, and the nullable AI summary. Use the
ticket panel to acknowledge, assign, and record resolution; the backend remains
the lifecycle authority and returns any invalid transition as an on-screen
conflict.

The Simulator panel submits documented fault, repair, and noise scenarios to
the same production telemetry pipeline. Live notifications refresh the console
when WebSocket connectivity is available. After a disconnection or reconnect,
the console refetches REST data; REST remains the authoritative source of
truth.

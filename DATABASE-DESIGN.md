# ElectriFix — Logical Database Model

> Design-only. No SQL, no Drizzle ORM code. Derived from the [frozen architecture](file:///Users/balajinayakbardawal/Learnings/ElectriFix/ARCHITECTURE.md). Revised after design review on 2026-08-04.

---

## Database Design Principles

1. **Ownership is explicit.** Every table has exactly one module that creates rows, one module that updates them, and a defined set of readers. No table is a free-for-all.

2. **Immutable events, mutable state.** `telemetry_events` is append-only (the audit log). `pole_states` is the mutable current-state view. They are never confused — readers know which one they need.

3. **The schema reflects the domain, not the framework.** Table names, column names, and constraints mirror the assignment's language (poles, feeders, distribution transformers, faults, tickets) — not generic ORM patterns.

4. **JSONB is used sparingly and intentionally.** Only for `FaultEvidence` on the `faults` table — a structured, well-typed blob that is written once and read as a whole. Not for fields that need to be queried, filtered, or joined.

5. **Indexes exist for queries, not for decoration.** Every index maps to a known query pattern from the architecture. No speculative indexes.

6. **Registry data is static at runtime.** Poles, DTs, and feeders are loaded once from seed. The schema enforces this through the ownership model — no application code writes to registry tables after startup.

---

## Entity List

### Tier 1 — Network Registry (Static, Seed-Only)

| Entity | Table Name | Mutability | Row Count |
|--------|-----------|------------|-----------|
| Feeder | `feeders` | Static after seed | ~5 |
| Distribution Transformer | `distribution_transformers` | Static after seed | ~60 |
| Pole | `poles` | Static after seed | ~4,000 |

### Tier 2 — Telemetry & State (High-Write)

| Entity | Table Name | Mutability | Row Count |
|--------|-----------|------------|-----------|
| Telemetry Event | `telemetry_events` | Append-only (immutable) | Grows continuously (~39/s) |
| Pole State | `pole_states` | Mutable (current state) | 1 per pole (~4,000) |

### Tier 3 — Fault & Ticket (Operational)

| Entity | Table Name | Mutability | Row Count |
|--------|-----------|------------|-----------|
| Fault | `faults` | Mutable (merge, resolve) | 12–120 per day |
| Ticket | `tickets` | Mutable (lifecycle state machine) | 1 per fault |
| Scheduled Outage | `scheduled_outages` | Static per import (mock) | ~10–20 active |

---

## Entity Responsibilities & Fields

### `feeders`

**Purpose:** Represents an 11 kV feeder line from the substation. Top of the network hierarchy.

| Field | Type | Nullable | Notes |
|-------|------|----------|-------|
| `feeder_id` | text | NO | PK. Natural key from registry (e.g., `F-07-03`) |
| `substation_id` | text | NO | Which 66/11 kV substation this feeder belongs to |
| `name` | text | YES | Human-readable name |
| `created_at` | timestamp | NO | Seed timestamp |

**Ownership:**

| Question | Answer |
|----------|--------|
| Who creates it? | `db/seed.ts` at startup |
| Who updates it? | Nobody. Static after seed. |
| Who reads it? | `TopologyResolver`, `ScheduledOutageFilter`, `NetworkMap` (via API) |
| Can anyone else modify it? | No. |

---

### `distribution_transformers`

**Purpose:** Represents a distribution transformer (DT) that steps 11 kV down to 400/230 V. Parent of all poles on its LT lines.

| Field | Type | Nullable | Notes |
|-------|------|----------|-------|
| `dt_id` | text | NO | PK. Natural key from registry (e.g., `D-0112`) |
| `feeder_id` | text | NO | FK → `feeders.feeder_id` |
| `lat` | double | NO | GPS latitude |
| `lon` | double | NO | GPS longitude |
| `capacity_kva` | integer | YES | Transformer capacity |
| `households_served` | integer | YES | Approximate household count |
| `has_recorded_topology` | boolean | NO | `true` if `seq_on_line` / `parent_pole_id` are populated for this DT's poles. Derived at seed time. |
| `created_at` | timestamp | NO | Seed timestamp |

**Ownership:**

| Question | Answer |
|----------|--------|
| Who creates it? | `db/seed.ts` at startup |
| Who updates it? | Nobody. Static after seed. |
| Who reads it? | `TopologyResolver` (to resolve tree), `FaultLocalizationEngine` (via resolver), `NetworkMap` (via API), `localize-faults` (to load affected DT) |
| Can anyone else modify it? | No. |

> [!NOTE]
> `has_recorded_topology` is a computed flag set at seed time. It saves the `TopologyResolver` from scanning all poles to determine which resolution strategy to use. It maps directly to the architecture's 40%/60% split.

---

### `poles`

**Purpose:** Represents a physical pole in the LT distribution network. The core asset registry entity.

| Field | Type | Nullable | Notes |
|-------|------|----------|-------|
| `pole_id` | text | NO | PK. Natural key from registry (e.g., `P-024431`) |
| `lat` | double | NO | Surveyed GPS. Always present, always trustworthy (±4m). |
| `lon` | double | NO | Surveyed GPS |
| `feeder_id` | text | NO | FK → `feeders.feeder_id` |
| `dt_id` | text | NO | FK → `distribution_transformers.dt_id` |
| `seq_on_line` | integer | YES | Position along LT line from DT, 1 = closest. **NULL for ~60% of DTs.** |
| `parent_pole_id` | text | YES | FK → `poles.pole_id` (self-referential). The pole immediately upstream. **NULL wherever `seq_on_line` is NULL.** |
| `pole_type` | text | YES | Material and height (e.g., `LT-9m-PCC`). Cosmetic. |
| `ward` | text | YES | Administrative ward |
| `pincode` | text | YES | PIN code. **NULL for ~3% of rows.** Resolved at query time via `pincode-lookup`. |
| `device_id` | text | YES | Current telemetry device fitted. **NULL for ~9% of poles.** |
| `created_at` | timestamp | NO | Seed timestamp |

**Ownership:**

| Question | Answer |
|----------|--------|
| Who creates it? | `db/seed.ts` at startup |
| Who updates it? | Nobody. Static after seed. |
| Who reads it? | `TopologyResolver` (to build tree), `PoleStateService` (to initialize state), `FaultLocalizationEngine` (via resolved tree), `NetworkMap` (via API), `pincode-lookup` (for fallback) |
| Can anyone else modify it? | No. |

> [!IMPORTANT]
> `parent_pole_id` is the self-referential FK that encodes the tree structure for DTs with recorded topology. Where it is NULL, the `TopologyResolver` falls through to `InferredTopologyResolver` or `FallbackTopologyResolver`. This column is the physical representation of the assignment's central design question.

---

### `telemetry_events`

**Purpose:** Immutable append-only log of every processed telemetry message received from pole devices. The raw event stream. Duplicates are silently dropped at ingest (`ON CONFLICT DO NOTHING`) and never stored.

| Field | Type | Nullable | Notes |
|-------|------|----------|-------|
| `id` | uuid | NO | PK. Server-generated. |
| `device_id` | text | NO | Device that sent this event |
| `pole_id` | text | NO | FK → `poles.pole_id`. Trusted for location per assignment. |
| `event` | text | NO | One of: `heartbeat`, `power_lost`, `power_restored`, `boot` |
| `energized` | boolean | NO | Device's current state at event time |
| `device_ts` | timestamp | NO | Device clock. **Skew up to ±90s.** Not monotonic across devices. |
| `seq` | integer | NO | Monotonic per device, resets on `boot`. Primary ordering/dedup tool. |
| `battery_mv` | integer | YES | Capacitor voltage. Below ~3200 = may miss dying message. |
| `rssi` | integer | YES | Radio signal strength |
| `firmware` | text | YES | Device firmware version |
| `received_at` | timestamp | NO | Server receive timestamp. **This is the trustworthy clock.** |

**Ownership:**

| Question | Answer |
|----------|--------|
| Who creates it? | `EventPipeline` — on every incoming telemetry message, after validation. Duplicates are rejected via `ON CONFLICT DO NOTHING` on `(device_id, seq)` and never inserted. |
| Who updates it? | Nobody. **Immutable.** Once written, never changed. |
| Who reads it? | Primarily for audit/debugging/event history timeline. `PoleStateService` does NOT read this table — it receives processed events in-memory from EventPipeline. |
| Can anyone else modify it? | No. Append-only. |

> [!IMPORTANT]
> **Duplicates are dropped, not stored.** The `(device_id, seq)` unique constraint combined with `ON CONFLICT DO NOTHING` means duplicate messages are silently discarded. If you need duplicate metrics, count them in-memory in EventPipeline or log them via Pino — don't store them in the database.

> [!NOTE]
> **No suppression tracking in this table.** Whether an event was suppressed due to a scheduled outage or classified as a dead sensor is a domain decision made by the noise filter, not a property of the raw event. The telemetry table stores what the device sent. The domain layer decides what to do with it.

---

### `pole_states`

**Purpose:** Mutable current-state view of every pole. The single source of truth for "is this pole live right now?" Backed by `PoleStateService` in the architecture.

| Field | Type | Nullable | Notes |
|-------|------|----------|-------|
| `pole_id` | text | NO | PK. FK → `poles.pole_id`. One row per pole. |
| `energized` | text | NO | Current status: `LIVE`, `DARK`, `PRESUMED_DARK`, `UNKNOWN` |
| `last_heartbeat_at` | timestamp | YES | Most recent heartbeat received. NULL if never heard from. |
| `last_event_at` | timestamp | YES | Most recent event of any type |
| `last_seq` | integer | YES | Last processed sequence number. Used for dedup/ordering. |
| `firmware_version` | text | YES | Current firmware. Determines behavior (fw 1.2 = silent death). |
| `device_health` | text | NO | `NO_DEVICE`, `HEALTHY`, `OFFLINE`, `DEGRADED`. `NO_DEVICE` means no telemetry hardware is installed. |
| `has_device` | boolean | NO | Whether a telemetry device is fitted. Copied from `poles.device_id IS NOT NULL` at seed time. |
| `battery_mv` | integer | YES | Last reported capacitor voltage |
| `rssi` | integer | YES | Last reported signal strength |
| `updated_at` | timestamp | NO | Last state change timestamp |

**Ownership:**

| Question | Answer |
|----------|--------|
| Who creates it? | `db/seed.ts` — initializes one row per pole with `UNKNOWN` status and `has_device` from registry |
| Who updates it? | **`PoleStateService` only.** Called by `ingest-telemetry` use case after EventPipeline processes an event. |
| Who reads it? | `FaultLocalizationEngine` (current pole states for boundary detection), `RestorationVerifier` (are affected poles live again?), `DeadSensorDetector` (isolated dark with live children?), `get-dashboard-data` (network status), `NetworkMap` (pole coloring) |
| Can anyone else modify it? | **No.** PoleStateService is the sole writer. This is enforced by the architecture — no other module imports the pole-state repository for writes. |

> [!IMPORTANT]
> This is the most critical ownership boundary in the database. `pole_states` is the mutable view that the entire localization pipeline reads from. If anything other than `PoleStateService` writes to it, the state model breaks. The architecture enforces this through dependency direction, not database-level permissions.

---

### `faults`

**Purpose:** A detected and localized fault in the network. Created when the `FaultLocalizationEngine` identifies a live/dark boundary. Carries structured `FaultEvidence` as JSONB.

| Field | Type | Nullable | Notes |
|-------|------|----------|-------|
| `fault_id` | uuid | NO | PK. Server-generated. |
| `dt_id` | text | NO | FK → `distribution_transformers.dt_id`. Which DT this fault is under. |
| `feeder_id` | text | NO | FK → `feeders.feeder_id`. Denormalized for query convenience. |
| `fault_type` | text | NO | `span`, `dt`, `feeder` |
| `status` | text | NO | `active`, `resolved`, `merged`. Default: `active`. |
| `span_pole_a` | text | YES | FK → `poles.pole_id`. Last live pole (upstream end of fault span). NULL for DT/feeder faults. |
| `span_pole_b` | text | YES | FK → `poles.pole_id`. First dark pole (downstream end of fault span). NULL for DT/feeder faults. |
| `lat` | double | NO | Fault location latitude (midpoint of span, or DT coords) |
| `lon` | double | NO | Fault location longitude |
| `pincode` | text | YES | Resolved PIN code. NULL only if offline lookup fails. |
| `affected_pole_count` | integer | NO | Count of downstream dark poles |
| `confidence_level` | text | NO | `HIGH`, `MEDIUM`, `LOW` |
| `topology_source` | text | NO | `RECORDED`, `INFERRED`, `FALLBACK` |
| `evidence` | jsonb | NO | Structured `FaultEvidence`. See JSONB section below. |
| `ai_summary` | text | YES | LLM-generated natural-language summary. **Nullable. Generated lazily. Failure to generate does not affect localization.** Localization must never wait for or depend on AI. |
| `merged_into_fault_id` | uuid | YES | FK → `faults.fault_id` (self-referential). If this fault was merged into another, points to the surviving fault. |
| `detected_at` | timestamp | NO | When the fault was first localized |
| `resolved_at` | timestamp | YES | When the fault was resolved (all poles re-energized) |
| `created_at` | timestamp | NO | Row creation time |
| `updated_at` | timestamp | NO | Last modification time |

**Ownership:**

| Question | Answer |
|----------|--------|
| Who creates it? | `localize-faults` use case — after `FaultLocalizationEngine` returns `FaultCandidate[]` |
| Who updates it? | `localize-faults` (merge when new symptoms match existing fault, update `ai_summary` when LLM responds), `RestorationVerifier` (mark resolved when poles re-energize) |
| Who reads it? | `localize-faults` (check for existing fault at same boundary before creating), `get-dashboard-data` (active faults list), `FaultCard` + `FaultEvidence` components (via API), `manage-ticket` (fault details for ticket actions) |
| Can anyone else modify it? | No. Only `localize-faults` and `RestorationVerifier`. |

> [!NOTE]
> **No `ticket_id` on faults.** The relationship is owned by the ticket side: `tickets.fault_id` points to the fault. Faults are domain entities owned by localization — they should not know that tickets exist. This follows the correct dependency direction: Ticket Management depends on Localization, not the reverse.

---

### `tickets`

**Purpose:** Tracks the lifecycle of a fault through the operations workflow. One ticket per fault. State machine enforced by `TicketLifecycle` in the domain layer.

| Field | Type | Nullable | Notes |
|-------|------|----------|-------|
| `ticket_id` | uuid | NO | PK. Server-generated. |
| `fault_id` | uuid | NO | FK → `faults.fault_id`. **Unique.** One-to-one with fault. The ticket owns this relationship. |
| `status` | text | NO | `detected`, `acknowledged`, `crew_assigned`, `resolved`, `verified`, `closed` |
| `assigned_crew` | text | YES | Crew identifier. Set when status moves to `crew_assigned`. |
| `operator_notes` | text | YES | Free-text notes from the operator |
| `rejection_count` | integer | NO | Default 0. Incremented when system rejects premature resolution. |
| `rejection_reason` | text | YES | Why the last resolution was rejected (e.g., "3 of 14 affected poles still dark") |
| `detected_at` | timestamp | NO | When the ticket was created |
| `acknowledged_at` | timestamp | YES | When operator acknowledged |
| `crew_assigned_at` | timestamp | YES | When crew was assigned |
| `resolved_at` | timestamp | YES | When crew marked as resolved (may be rejected) |
| `verified_at` | timestamp | YES | When telemetry confirmed restoration |
| `closed_at` | timestamp | YES | When auto-closed after verification |
| `created_at` | timestamp | NO | Row creation time |
| `updated_at` | timestamp | NO | Last modification time |

**Ownership:**

| Question | Answer |
|----------|--------|
| Who creates it? | `localize-faults` use case — creates ticket immediately when a new fault is detected |
| Who updates it? | `manage-ticket` use case — processes operator actions (acknowledge, assign, resolve) via `TicketLifecycle`. `RestorationVerifier` — moves to `verified` when telemetry confirms. `TicketLifecycle` — rejects premature resolution (pushes back to `crew_assigned`). |
| Who reads it? | `get-dashboard-data` (ticket list), `TicketList` + `TicketDetail` components (via API), `RestorationVerifier` (which tickets need restoration checking?) |
| Can anyone else modify it? | No. All writes go through `TicketLifecycle` which enforces valid state transitions. |

> [!NOTE]
> `rejection_count` and `rejection_reason` directly support the assignment requirement: "If a lineman marks it fixed and the poles are still dark, the system should not believe him." These fields create an audit trail of rejected closures.

> [!NOTE]
> **No `previous_status` column.** The lifecycle timestamps (`acknowledged_at`, `crew_assigned_at`, `resolved_at`, `verified_at`, `closed_at`) already tell the full story of which states were reached and when. If a full audit trail is ever needed, introduce a `ticket_history` table — don't overload the ticket row.

---

### `scheduled_outages`

**Purpose:** Planned load shedding and maintenance windows from the department's outage feed. Used by `ScheduledOutageFilter` to suppress false positives.

| Field | Type | Nullable | Notes |
|-------|------|----------|-------|
| `outage_id` | text | NO | PK. Natural key from feed (e.g., `SO-2026-07-29-014`) |
| `scope` | text | NO | `feeder` or `dt` |
| `target_id` | text | NO | The `feeder_id` or `dt_id` being shut down |
| `scheduled_start` | timestamp | NO | Planned start time |
| `scheduled_end` | timestamp | NO | Planned end time |
| `reason` | text | YES | E.g., "Planned maintenance - jumper replacement" |
| `created_at` | timestamp | NO | Row creation time |

**Ownership:**

| Question | Answer |
|----------|--------|
| Who creates it? | `scheduled-outage-client` (mock) — loads from `data/seed/scheduled-outages.json` |
| Who updates it? | `scheduled-outage-client` — refreshes on poll interval |
| Who reads it? | `ScheduledOutageFilter` (cross-reference dark poles against active windows ±40min tolerance) |
| Can anyone else modify it? | No. |

---

## Entity Relationships

### Mermaid ER Diagram

```mermaid
erDiagram
    feeders {
        text feeder_id PK
        text substation_id
        text name
        timestamp created_at
    }

    distribution_transformers {
        text dt_id PK
        text feeder_id FK
        double lat
        double lon
        integer capacity_kva
        integer households_served
        boolean has_recorded_topology
        timestamp created_at
    }

    poles {
        text pole_id PK
        double lat
        double lon
        text feeder_id FK
        text dt_id FK
        integer seq_on_line
        text parent_pole_id FK
        text pole_type
        text ward
        text pincode
        text device_id
        timestamp created_at
    }

    telemetry_events {
        uuid id PK
        text device_id
        text pole_id FK
        text event
        boolean energized
        timestamp device_ts
        integer seq
        integer battery_mv
        integer rssi
        text firmware
        timestamp received_at
    }

    pole_states {
        text pole_id PK_FK
        text energized
        timestamp last_heartbeat_at
        timestamp last_event_at
        integer last_seq
        text firmware_version
        text device_health
        boolean has_device
        integer battery_mv
        integer rssi
        timestamp updated_at
    }

    faults {
        uuid fault_id PK
        text dt_id FK
        text feeder_id FK
        text fault_type
        text status
        text span_pole_a FK
        text span_pole_b FK
        double lat
        double lon
        text pincode
        integer affected_pole_count
        text confidence_level
        text topology_source
        jsonb evidence
        text ai_summary
        uuid merged_into_fault_id FK
        timestamp detected_at
        timestamp resolved_at
        timestamp created_at
        timestamp updated_at
    }

    tickets {
        uuid ticket_id PK
        uuid fault_id FK
        text status
        text assigned_crew
        text operator_notes
        integer rejection_count
        text rejection_reason
        timestamp detected_at
        timestamp acknowledged_at
        timestamp crew_assigned_at
        timestamp resolved_at
        timestamp verified_at
        timestamp closed_at
        timestamp created_at
        timestamp updated_at
    }

    scheduled_outages {
        text outage_id PK
        text scope
        text target_id
        timestamp scheduled_start
        timestamp scheduled_end
        text reason
        timestamp created_at
    }

    feeders ||--o{ distribution_transformers : "supplies"
    feeders ||--o{ poles : "feeds"
    distribution_transformers ||--o{ poles : "serves"
    poles ||--o| poles : "parent_pole_id"
    poles ||--|| pole_states : "has current state"
    poles ||--o{ telemetry_events : "reports"
    distribution_transformers ||--o{ faults : "has faults"
    faults ||--|| tickets : "tracked by"
    faults ||--o| faults : "merged into"
    faults o|--o| poles : "span_pole_a"
    faults o|--o| poles : "span_pole_b"
```

### Relationship Summary

| Relationship | Cardinality | FK Column | Notes |
|-------------|-------------|-----------|-------|
| Feeder → DTs | 1:many | `distribution_transformers.feeder_id` | Every DT belongs to exactly one feeder |
| Feeder → Poles | 1:many | `poles.feeder_id` | Denormalized; could be derived via DT but kept for direct queries |
| DT → Poles | 1:many | `poles.dt_id` | Every pole belongs to exactly one DT |
| Pole → Pole (parent) | 1:many (self) | `poles.parent_pole_id` | Tree structure. NULL for ~60% of DTs. |
| Pole → PoleState | 1:1 | `pole_states.pole_id` | Every pole has exactly one current state row |
| Pole → TelemetryEvents | 1:many | `telemetry_events.pole_id` | A pole receives many events over time |
| DT → Faults | 1:many | `faults.dt_id` | Multiple faults can occur under one DT |
| Ticket → Fault | 1:1 | `tickets.fault_id` (UNIQUE) | **Ticket owns this relationship.** FK only on ticket side. Correct dependency direction: Ticket Management → Localization. |
| Fault → Fault (merge) | many:1 | `faults.merged_into_fault_id` | Multiple faults can merge into one survivor |
| Fault → Pole (span A) | many:1 | `faults.span_pole_a` | Last live pole. NULL for DT/feeder faults. |
| Fault → Pole (span B) | many:1 | `faults.span_pole_b` | First dark pole. NULL for DT/feeder faults. |

---

## Primary Key Strategy

| Table | PK | Type | Rationale |
|-------|-----|------|-----------|
| `feeders` | `feeder_id` | Natural (text) | Stable identifiers from the department's registry. Meaningful, unique, never change. |
| `distribution_transformers` | `dt_id` | Natural (text) | Same as feeders — stable registry IDs. |
| `poles` | `pole_id` | Natural (text) | Same as feeders — stable registry IDs. |
| `telemetry_events` | `id` | Surrogate (UUIDv7) | No natural key. `device_id + seq` is the dedup key but not globally unique (seq resets on boot). UUIDv7 is time-sortable — good for append-only tables. |
| `pole_states` | `pole_id` | Natural (text, FK) | 1:1 with `poles`. The pole_id IS the state's identity. |
| `faults` | `fault_id` | Surrogate (UUIDv7) | No natural key. System-generated. Time-sortable. |
| `tickets` | `ticket_id` | Surrogate (UUIDv7) | No natural key. System-generated. Time-sortable. |
| `scheduled_outages` | `outage_id` | Natural (text) | Stable identifiers from the department's outage feed. |

> [!NOTE]
> **UUIDv7 for surrogate keys.** Time-sortable UUIDs avoid the insert performance problems of random UUIDv4 on B-tree indexes. At our scale this barely matters, but it's good practice and costs nothing.

---

## Foreign Key Strategy

| Tier | FK Enforcement | Rationale |
|------|---------------|-----------|
| **Registry → Registry** (feeders ↔ DTs ↔ poles) | **Enforced.** `ON DELETE RESTRICT`. | Static data loaded at seed time. Referential integrity must hold. A pole cannot exist without its DT and feeder. |
| **State → Registry** (pole_states → poles) | **Enforced.** `ON DELETE CASCADE`. | 1:1 relationship. If a pole is removed (re-seed), its state goes with it. |
| **Telemetry → Registry** (telemetry_events → poles) | **Enforced.** `ON DELETE RESTRICT` on `pole_id`. | Telemetry belongs to an immutable registry pole. Accidental pole deletion must fail rather than rewriting telemetry history. |
| **Operational → Registry** (faults → DTs, faults → poles) | **Enforced.** `ON DELETE RESTRICT`. | Faults reference real network assets. Integrity must hold. |
| **Operational → Operational** (tickets → faults) | **Enforced.** `ON DELETE RESTRICT`. | A ticket cannot exist without its fault. FK only on `tickets.fault_id` — faults do not reference tickets. |
| **Self-referential** (poles → poles, faults → faults) | **Enforced.** `ON DELETE SET NULL`. | Parent pole deletion or fault merge target deletion should not cascade — just NULL the reference. |

---

## Constraints

### Unique Constraints

| Table | Constraint | Columns | Purpose |
|-------|-----------|---------|---------|
| `telemetry_events` | `uq_device_seq` | `(device_id, seq)` | Deduplication. `ON CONFLICT DO NOTHING`. Duplicates are silently dropped, never stored. Per architecture decision D3. |
| `tickets` | `uq_ticket_fault` | `(fault_id)` | Ensures 1:1 — no two tickets can reference the same fault. Single FK, no circular dependency. |

### Check Constraints

| Table | Constraint | Rule | Purpose |
|-------|-----------|------|---------|
| `telemetry_events` | `ck_event_type` | `event IN ('heartbeat', 'power_lost', 'power_restored', 'boot')` | Matches assignment's defined event types |
| `pole_states` | `ck_energized_status` | `energized IN ('LIVE', 'DARK', 'PRESUMED_DARK', 'UNKNOWN')` | Matches architecture's PoleState enum |
| `pole_states` | `ck_device_health` | `device_health IN ('NO_DEVICE', 'HEALTHY', 'OFFLINE', 'DEGRADED')` | Matches architecture's DeviceHealth enum |
| `faults` | `ck_fault_type` | `fault_type IN ('span', 'dt', 'feeder')` | Matches assignment's fault types |
| `faults` | `ck_fault_status` | `status IN ('active', 'resolved', 'merged')` | Fault lifecycle |
| `faults` | `ck_confidence` | `confidence_level IN ('HIGH', 'MEDIUM', 'LOW')` | Matches architecture's confidence levels |
| `faults` | `ck_topology_source` | `topology_source IN ('RECORDED', 'INFERRED', 'FALLBACK')` | Matches TopologyResolver output |
| `tickets` | `ck_ticket_status` | `status IN ('detected', 'acknowledged', 'crew_assigned', 'resolved', 'verified', 'closed')` | Matches TicketLifecycle state machine |
| `scheduled_outages` | `ck_outage_scope` | `scope IN ('feeder', 'dt')` | Matches assignment's outage scope types |

> [!NOTE]
> **Postgres enums vs check constraints:** Check constraints are preferred here over Postgres native enums because enums cannot be altered without a migration. Check constraints can be modified in-place. At this scale, the performance difference is zero.

---

## Index Strategy

Every index maps to a specific query pattern from the architecture.

### Registry Tables

| Table | Index | Columns | Query Pattern |
|-------|-------|---------|---------------|
| `poles` | `idx_poles_dt` | `(dt_id)` | `TopologyResolver` loads all poles for a given DT to build the tree |
| `poles` | `idx_poles_feeder` | `(feeder_id)` | `ScheduledOutageFilter` loads all poles on a feeder to check scheduled outages |
| `poles` | `idx_poles_parent` | `(parent_pole_id)` | `RecordedTopologyResolver` builds tree by following parent chain |
| `poles` | `idx_poles_device` | `(device_id)` | `EventPipeline` resolves device_id → pole_id (for telemetry that arrives with device_id) |

### Telemetry Table

| Table | Index | Columns | Query Pattern |
|-------|-------|---------|---------------|
| `telemetry_events` | `uq_device_seq` (unique) | `(device_id, seq)` | Deduplication on ingest. `ON CONFLICT DO NOTHING`. |
| `telemetry_events` | `idx_telem_pole_received` | `(pole_id, received_at DESC)` | Event history timeline for a specific pole (dashboard detail view) |
| `telemetry_events` | `idx_telem_received` | `(received_at DESC)` | Recent events query for debugging / system health |

### State Table

| Table | Index | Columns | Query Pattern |
|-------|-------|---------|---------------|
| `pole_states` | PK on `pole_id` | — | All lookups are by `pole_id` (1:1 with poles) |
| `pole_states` | `idx_pstate_dt_energized` | `(dt_id_derived, energized)` | **Not indexed directly** — see note below |

> [!NOTE]
> `pole_states` does not have a `dt_id` column. When `FaultLocalizationEngine` needs all pole states for a DT, it joins `pole_states` with `poles` on `pole_id` and filters by `poles.dt_id`. At ~4,000 rows, this full table is small enough to be held in memory by `PoleStateService`. The join is only needed on startup or cache rebuild — not on every telemetry event.

### Operational Tables

| Table | Index | Columns | Query Pattern |
|-------|-------|---------|---------------|
| `faults` | `idx_faults_status` | `(status)` WHERE `status = 'active'` | Dashboard loads active faults. Partial index — only indexes the active ones. |
| `faults` | `idx_faults_dt` | `(dt_id)` | `localize-faults` checks for existing fault under same DT before creating |
| `faults` | `idx_faults_detected` | `(detected_at DESC)` | Dashboard sorts faults by recency |
| `tickets` | `idx_tickets_status` | `(status)` WHERE `status NOT IN ('verified', 'closed')` | Dashboard loads open tickets. Partial index. |
| `tickets` | `idx_tickets_fault` | `(fault_id)` | Lookup ticket by fault (1:1 but queried from fault side) |
| `scheduled_outages` | `idx_outages_time` | `(scheduled_start, scheduled_end)` | `ScheduledOutageFilter` checks if current time falls within any active window (±40min) |
| `scheduled_outages` | `idx_outages_target` | `(scope, target_id)` | `ScheduledOutageFilter` looks up outages for a specific feeder or DT |

---

## JSONB Usage

### `faults.evidence` — The FaultEvidence Column

**Why JSONB:** `FaultEvidence` is a structured document that is:
- Written once when the fault is created (or updated on merge)
- Read as a whole unit (never partially queried or filtered by sub-fields)
- Displayed in the `FaultEvidence` UI component and returned via API
- Complex enough (nested arrays, variable-length lists) that normalizing it into separate tables would add joins for zero query benefit

**Structure** (matching [ARCHITECTURE.md §4](file:///Users/balajinayakbardawal/Learnings/ElectriFix/ARCHITECTURE.md#L457-L470)):

```
{
  "last_live_pole": "P-024431",
  "first_dark_pole": "P-024432",
  "fault_span": ["P-024431", "P-024432"],
  "affected_poles": ["P-024432", "P-024433", "P-024434", ...],
  "affected_pole_count": 14,
  "topology_source": "RECORDED",
  "confidence_level": "HIGH",
  "confidence_reasons": [
    { "factor": "Recorded topology available", "positive": true, "detail": "DT D-0112 has complete pole ordering" },
    { "factor": "Downstream confirmations", "positive": true, "detail": "14 of 14 downstream poles confirmed dark" },
    { "factor": "Sensor coverage gap", "positive": false, "detail": "2 poles in affected area have no device" }
  ],
  "coordinates": { "lat": 12.9682, "lon": 77.5946 },
  "pincode": "560078",
  "suppressed_sensors": ["P-024440"]
}
```

**What is NOT in JSONB:**
- `confidence_level` — promoted to a top-level column for filtering/sorting
- `topology_source` — promoted to a top-level column for filtering
- `affected_pole_count` — promoted to a top-level column for sorting by severity
- `lat`, `lon`, `pincode` — promoted for map queries

These fields are **denormalized**: they exist both in the JSONB blob (for complete evidence display) and as top-level columns (for querying). The top-level columns are the query interface; the JSONB is the display interface.

> [!WARNING]
> **No GIN index on `evidence`.** We never query into JSONB sub-fields. If we ever need to (e.g., "find all faults where confidence_reason X was negative"), the right approach is to promote that field to a top-level column, not to index the JSONB.

---

## Data Retention Strategy

| Table | Retention | Rationale |
|-------|-----------|-----------|
| `feeders`, `distribution_transformers`, `poles` | Permanent | Static registry. Tiny. |
| `pole_states` | Permanent (overwritten) | Always exactly 1 row per pole. ~4,000 rows. Negligible. |
| `telemetry_events` | **Retention candidate.** Keep last 30 days, archive or delete older. | At 39 msg/s = ~3.4M rows/day. This is the only table that grows unboundedly. |
| `faults` | Keep last 90 days of resolved faults. Active faults kept indefinitely. | Low volume (12–120/day). Evidence JSONB adds size but not enough to matter at 90-day scale. |
| `tickets` | Same lifecycle as faults. | 1:1 with faults. |
| `scheduled_outages` | Keep last 30 days. | Low volume. |

> [!IMPORTANT]
> **`telemetry_events` is the only table that needs a retention policy for this exercise.** At ~3.4M rows/day, a 30-day window is ~100M rows. For the assignment scope (demo with synthetic data), this is fine. For production, partitioning by `received_at` (monthly partitions) would be the next step. Document this in DECISIONS.md.

---

## Performance Considerations

### Write-Heavy Tables

| Table | Write Pattern | Mitigation |
|-------|--------------|------------|
| `telemetry_events` | 39 msg/s steady, 5,000 burst in 10s | EventPipeline validates, orders, and deduplicates events before persistence. Each accepted event is written immediately to PostgreSQL. `ON CONFLICT DO NOTHING` provides idempotent ingest. At the expected workload, synchronous writes are sufficient. Batch writes are intentionally deferred until performance measurements demonstrate they are necessary. |
| `pole_states` | 39 updates/s (one per telemetry event) | `PoleStateService` holds state in memory. Writes to DB are synchronous — every processed event triggers an immediate `UPDATE`. At 39/s, Postgres handles this easily. Critical: use `UPDATE` not `DELETE + INSERT`. The in-memory cache is the runtime read model; PostgreSQL remains the durable source of truth and is used to rebuild state after restart.|

### Read-Heavy Tables

| Table | Read Pattern | Mitigation |
|-------|-------------|------------|
| `poles` | Loaded on startup by `TopologyResolver`. Joined to `pole_states` by `PoleStateService`. | Load into memory at startup. ~4,000 rows = trivially small. |
| `pole_states` | Read by `FaultLocalizationEngine` on every detection cycle | Served from `PoleStateService`'s in-memory cache, not from DB. DB is persistence layer, not query layer for this table. |
| `faults` (active) | Dashboard polls or receives via WS | Partial index on `status = 'active'` keeps the working set small. |
| `tickets` (open) | Dashboard polls or receives via WS | Partial index on open statuses. |

### Query Patterns That Must Be Fast

| Query | Target | How |
|-------|--------|-----|
| "All poles for DT X" | `poles WHERE dt_id = ?` | `idx_poles_dt` index. ~70 rows per DT (median). |
| "Current state of all poles for DT X" | `pole_states JOIN poles ON pole_id WHERE dt_id = ?` | In-memory via PoleStateService. DB fallback uses `idx_poles_dt`. |
| "All active faults" | `faults WHERE status = 'active'` | `idx_faults_status` partial index. Typically < 20 rows. |
| "All open tickets" | `tickets WHERE status NOT IN ('verified', 'closed')` | `idx_tickets_status` partial index. Typically < 20 rows. |
| "Is this a duplicate?" | `telemetry_events WHERE device_id = ? AND seq = ?` | `uq_device_seq` unique index. `ON CONFLICT DO NOTHING`. |
| "Scheduled outages now" | `scheduled_outages WHERE scheduled_start <= now + 40min AND scheduled_end >= now - 40min` | `idx_outages_time` + `idx_outages_target`. Very small table. |

---

## Design Questions — Resolved

All six design questions were reviewed and resolved on 2026-08-04.

| # | Question | Resolution | Rationale |
|---|----------|------------|-----------|
| **Q1** | `pole_states` writes: sync or batched? | **Synchronous.** | At 39/s, Postgres handles single-row UPDATEs easily. Don't optimize prematurely. Revisit only if measured perf issues arise. |
| **Q2** | Partition `telemetry_events`? | **No.** Document as production recommendation. | Partitioning adds complexity for zero benefit at assignment scale. Mention monthly partitioning in DECISIONS.md. |
| **Q3** | `faults` and `tickets`: one table or two? | **Two tables.** | Fault = what the system discovered. Ticket = what the operator manages. Different owners, different lifecycle, different UI, different read patterns. Merging violates ownership model. |
| **Q4** | `affected_poles`: JSONB array or junction table? | **JSONB array** inside `evidence`. | We never query "which faults affect pole X?" — always load evidence as a whole. Junction table adds joins for zero query benefit. |
| **Q5** | `scheduled_outages`: polymorphic or separate FK columns? | **Polymorphic** (`scope` + `target_id`). | Matches assignment's mock API exactly. `scope` column disambiguates. Only reader (`ScheduledOutageFilter`) already knows the scope. |
| **Q6** | `Fault ↔ Ticket` 1:1: FK on both sides? | **FK only on `tickets.fault_id` (UNIQUE).** | Correct dependency direction: Ticket Management → Localization. Faults don't know tickets exist. No circular FKs. Cleaner ownership. |

### Review Refinements Applied

| # | Change | Rationale |
|---|--------|-----------|
| **R1** | Removed `telemetry_events.is_duplicate` | Duplicates are silently dropped via `ON CONFLICT DO NOTHING`. Storing them creates unnecessary growth. Count dupes in memory or logs if needed. |
| **R2** | Removed `telemetry_events.suppressed_reason` | Whether an event was suppressed is a domain decision, not a property of the raw event. Telemetry table stores what the device sent. Domain layer decides what to do with it. |
| **R3** | Added non-blocking documentation to `faults.ai_summary` | AI is optional. Localization must never wait for or depend on LLM. Explicitly documented as nullable, lazily generated, non-blocking. |
| **R4** | Removed `tickets.previous_status` | Lifecycle timestamps already tell the full story. If a full audit trail is ever needed, introduce a `ticket_history` table. |

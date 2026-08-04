# DECISIONS.md

> Engineering decision log for ElectriFix.
>
> Every meaningful architectural or product decision is recorded here along with
> the alternatives considered and the reasoning behind the final choice.
>
> Status values:
> - Accepted
> - Superseded
> - Rejected

---

# D-001 — Documentation-First Development

**Status:** Accepted

## Decision

The project will be developed documentation-first. Every major architectural or product decision will be documented before implementation begins.

## Reason

The assignment explicitly evaluates engineering judgement, communication, and reproducibility. Maintaining documentation throughout development ensures implementation follows intentional design rather than reverse-engineering documentation later.

## Alternatives Considered

- Implement first and document afterwards.

## Why Rejected

Often leads to documentation drifting away from implementation and weakens engineering traceability.

---

# D-002 — Layered Architecture

**Status:** Accepted

## Decision

Adopt a layered architecture with clear separation between:

- Presentation
- Application
- Domain
- Infrastructure

Business logic remains independent of frameworks such as Express, React and Drizzle ORM.

## Reason

Allows deterministic domain logic to be tested independently while keeping infrastructure replaceable.

## Alternatives Considered

Feature-based architecture with controllers owning business logic.

## Why Rejected

Couples business logic to transport and makes testing significantly harder.

---

# D-003 — Hybrid Topology Resolution

**Status:** Accepted

## Decision

Introduce a `TopologyResolver` abstraction with three strategies:

- RecordedTopologyResolver
- InferredTopologyResolver
- FallbackTopologyResolver

The localization engine depends only on the abstraction.

## Reason

The assignment's central challenge is incomplete topology data. This approach allows precise localization where topology exists while degrading gracefully elsewhere.

## Alternatives Considered

- Assume topology always exists.
- Use inference everywhere.

## Why Rejected

Neither reflects the real constraints described in the assignment.

---

# D-004 — Mutable Pole State + Immutable Telemetry

**Status:** Accepted

## Decision

Separate telemetry history from current network state.

Telemetry events are append-only.

Pole state is mutable and always represents the latest known network state.

## Reason

Localization reasons about current network state, while telemetry remains an immutable audit trail.

## Alternatives Considered

Using telemetry history directly during localization.

## Why Rejected

Would increase computational complexity and blur responsibilities.

---

# D-005 — Fault and Ticket Separation

**Status:** Accepted

## Decision

Faults and Tickets are modelled as separate aggregates.

A fault represents a technical incident.

A ticket represents operational workflow.

The relationship is one-to-one through `tickets.fault_id`.

## Reason

Each entity has different ownership, lifecycle and responsibilities.

## Alternatives Considered

Single Incident table.

Circular foreign keys.

## Why Rejected

Reduced separation of concerns and introduced unnecessary coupling.

---

# D-006 — Deterministic Localization

**Status:** Accepted

## Decision

Fault localization is implemented entirely using deterministic algorithms.

Large Language Models are never used to determine fault locations.

## Reason

Graph traversal and boundary detection are deterministic, explainable and inexpensive.

## Alternatives Considered

LLM-assisted localization.

## Why Rejected

Lower explainability, higher latency and inconsistent behaviour.

---

# D-007 — Structured Explainability

**Status:** Accepted

## Decision

Every localized fault carries structured evidence including:

- Last live pole
- First dark pole
- Topology source
- Confidence level
- Confidence reasons
- Suppressed sensors

## Reason

Operators should understand *why* the system reached a conclusion instead of seeing only a confidence score.

---

# D-008 — Simulator Uses Production Pipeline

**Status:** Accepted

## Decision

The simulator generates telemetry only.

It never creates faults or tickets directly.

## Reason

All behaviour must emerge from the same pipeline used by production telemetry, ensuring realistic validation.

---

# D-009 — Lean Infrastructure

**Status:** Accepted

## Decision

Keep infrastructure intentionally lightweight.

Avoid unnecessary factories, repository hierarchies and generic abstractions.

## Reason

The assignment values judgement over enterprise complexity.

The architecture should remain easy to understand within the scope of the exercise.

---

# D-010 — Stateful Processing, Stateless Localization

**Status:** Accepted

## Decision

Separate network state management from fault localization.

`PoleStateService` owns the latest known network state.

`FaultLocalizationEngine` remains completely stateless and operates only on a snapshot of current pole states and resolved topology.

## Reason

Keeping localization stateless makes it deterministic, repeatable and easy to test while allowing state management to evolve independently.

## Alternatives Considered

Allow the localization engine to maintain its own internal state.

## Why Rejected

Mixed responsibilities, reduced testability and made deterministic behaviour harder to guarantee.

---

# D-011 — Rule-Based Confidence Evaluation

**Status:** Accepted

## Decision

Confidence is evaluated using deterministic rules rather than percentages or heuristics embedded inside the algorithm.

Each rule documents:

- condition
- effect
- operator-facing reason

The final confidence is expressed as:

- HIGH
- MEDIUM
- LOW

## Reason

Operators should understand why confidence changed, and engineers should be able to reproduce the same result from the same inputs.

## Alternatives Considered

Weighted confidence scores.

Machine-learning confidence estimation.

## Why Rejected

Less explainable and harder to validate during implementation.

---

# D-012 — Immutable Fault Evidence

**Status:** Accepted

## Decision

FaultEvidence represents the reasoning available when a fault was localized.

After creation it is immutable.

Subsequent telemetry creates new localization results rather than modifying historical reasoning.

## Reason

Preserves auditability and allows operators to understand exactly what information produced a localization decision.

## Alternatives Considered

Updating evidence in-place.

## Why Rejected

Historical reasoning would be lost and debugging incorrect localizations becomes significantly harder.

---

# D-013 — Specification-Driven Implementation

**Status:** Accepted

## Decision

Implementation will follow frozen engineering specifications rather than allowing implementation to define system behaviour.

The following documents are treated as authoritative engineering contracts:

- ARCHITECTURE.md
- DATABASE-DESIGN.md
- LOCALIZATION-SPECIFICATION.md
- API-SPECIFICATION.md

Any architectural or behavioural change must first update the relevant specification before implementation.

## Reason

Separating design from implementation reduces ambiguity, prevents design drift, and allows implementation to be validated against stable engineering contracts.

## Alternatives Considered

Allow implementation to evolve independently and update documentation afterwards.

## Why Rejected

Creates inconsistencies between implementation and documentation, making future maintenance and code reviews significantly harder.

---

# D-014 — Contract-First API Design

**Status:** Accepted

## Decision

Freeze the REST and WebSocket API contract before implementing controllers or frontend integrations.

The API specification defines resource ownership, behavioural contracts, request and response models, error handling, WebSocket events, and interaction flows.

## Reason

The API is the primary boundary between backend, frontend, simulator, and external integrations. A stable contract enables independent implementation while minimizing integration issues.

## Alternatives Considered

Design endpoints incrementally during implementation.

## Why Rejected

Leads to inconsistent contracts, duplicated behaviour, and unnecessary API changes during development.

---

# D-015 — API as an Application Boundary

**Status:** Accepted

## Decision

REST endpoints act only as transport adapters.

Business rules remain inside the Application and Domain layers.

Controllers are responsible only for:

- request validation
- invoking application use cases
- formatting responses
- translating errors

Controllers must never perform localization, ticket workflow, topology reasoning, or business decisions directly.

## Reason

Preserves the layered architecture and ensures business logic remains framework-independent and testable.

## Alternatives Considered

Embedding business logic inside controllers.

## Why Rejected

Increases coupling between transport and domain logic, reduces reusability, and makes testing more difficult.

---

# D-016 — Phase-Based Implementation Contracts

**Status:** Accepted

## Decision

Implementation will follow a dependency-driven execution plan defined in `IMPLEMENTATION-PLAN.md`.

Each phase represents a bounded engineering increment with its own:

- scope
- dependencies
- acceptance criteria
- testing requirements
- documentation updates
- suggested commit boundaries
- definition of done

A subsequent phase must not begin until the current phase satisfies its completion criteria or an explicit exception is recorded in `DECISIONS.md`.

## Reason

The project is intentionally developed incrementally rather than feature-by-feature.

A phased implementation plan ensures architecture, implementation, testing, documentation, and commit history evolve together, making the project reproducible and allowing another engineer or AI implementation agent to continue development without additional architectural decisions.

## Alternatives Considered

Implement features opportunistically as development progresses.

Maintain a lightweight task list or sprint board.

## Why Rejected

Neither approach captures implementation dependencies, engineering checkpoints, or documentation responsibilities.

The assignment evaluates engineering process in addition to implementation, making a structured execution plan more appropriate.

---

# D-017 — Immutable Registry and Runtime-Derived Operational State

**Status:** Accepted

## Decision

- Standardize generated telemetry, fault, and ticket identifiers on UUIDv7. UUID generation occurs in the application layer; PostgreSQL native generation is not required.
- Treat registry entities as immutable master data. `telemetry_events.pole_id` remains non-null and its foreign key uses `ON DELETE RESTRICT`.
- Do not persist time-dependent outage activity. `scheduled_outages.is_active` is derived at runtime from `scheduled_start <= current_time <= scheduled_end`. API responses may expose it as a computed field.

## Reason

UUIDv7 improves index locality for append-heavy inserts. Registry deletion must fail rather than silently rewriting telemetry history. Runtime-derived outage activity remains correct without a scheduler or stale stored state.

## Alternatives Considered

- UUIDv4 for generated identifiers.
- `ON DELETE SET NULL` for telemetry pole references.
- A stored outage activity flag maintained by a scheduled update process.

## Why Rejected

UUIDv4 loses time ordering. A nullable telemetry pole reference conflicts with the immutable registry model. A persisted activity flag introduces synchronization and ownership ambiguity before a scheduler exists.

---

# D-018 — Relative-Time Seed Data

**Status:** Accepted

## Decision

Synthetic scheduled outages use timestamps relative to the seed execution time rather than fixed historical dates. Idempotent upserts retain deterministic outage IDs while refreshing their windows on each seed run.

## Reason

Fresh deployments retain finished, active, upcoming, and future outage examples, keeping runtime-derived outage activity meaningful for reviewers and later suppression, simulator, and dashboard phases.

## Alternatives Considered

Fixed timestamps from the assignment scenario.

## Why Rejected

Over time, fixed outage windows become entirely historical and reduce the usefulness of the seeded environment.

---

# D-019 — Separate Device Presence from Device Health

**Status:** Accepted

## Decision

The `device_health` enum includes `NO_DEVICE` to distinguish poles without installed telemetry devices from poles whose installed devices are offline. Seeded device-less poles use `NO_DEVICE`; seeded poles with a device use `HEALTHY`.

## Reason

Device presence and device health are separate operational concepts. A pole without installed hardware is not experiencing a communication failure.

## Alternatives Considered

Treat poles without devices as `OFFLINE`.

## Why Rejected

This conflates hardware absence with hardware failure and would complicate telemetry processing, operator reasoning, and future device-health monitoring.

---

# D-020 — Telemetry Stream Identity

**Status:** Accepted

## Decision

Telemetry identity is `(device_id, boot_counter, seq)`. Each device persists a `boot_counter` that increments once per reboot; `seq` resets to 0 within that counter. For one device, `(boot_counter, seq)` is strictly monotonic in lexicographic order. Duplicate detection and stale retry rejection use this ordered tuple, and `pole_states` persists `last_boot_counter` with `last_seq` for restart recovery.

## Reason

The assignment protocol resets `seq` after boot while also requiring at-least-once delivery and stale-retry rejection. `device_id + seq` cannot distinguish a new post-boot event from a delayed event in an earlier device generation. The explicit stream discriminator makes the distinction deterministic without trusting device time or arrival time.

## Alternatives Considered

- `device_id + seq`.
- Server-managed device sessions.
- Timestamps or device time as a session discriminator.

## Why Rejected

`device_id + seq` collides after every reboot. Server-managed sessions cannot deterministically distinguish a lost or delayed boot from a stale retry, and server restart does not restore missing protocol information. `received_at` describes delivery rather than source-event identity, while device time has documented clock skew and is not trusted for ordering.

---

D-021 — Telemetry Ingestion Pipeline Behavior

Status:
Accepted

Context

The ingestion pipeline must admit telemetry quickly while preserving deterministic
ordering, duplicate handling, and restart safety without coupling ingestion to
localization or ticket creation.

Decision

The EventPipeline is the sole ingestion orchestrator.

Telemetry processing order is:

1. Validate request
2. Business validation
3. Lexicographic tuple comparison using
   (boot_counter, seq)
4. Persist telemetry event
5. Forward accepted event to PoleStateService
6. Publish internal completion notification

The pipeline performs tuple ordering using immutable PoleState snapshots.

PoleStateService remains the sole owner of mutable pole state.

Duplicate detection uses the database unique constraint:

(device_id, boot_counter, seq)

The ingestion buffer is an in-memory fixed-capacity FIFO ring buffer of 8,192
events drained every 50 ms.

Buffer overflow returns:

HTTP 503
PIPELINE_BUFFER_FULL

The buffer never grows dynamically.

Pending ordering cursors exist only while events remain queued and are removed
after the final queued tuple completes.

Consequences

- deterministic ordering
- no secondary ordering authority
- durable ordering remains in pole_states
- localization remains decoupled

---

D-022 — Fault Localization Engine Purity

Status
Accepted

Context

The localization engine must remain deterministic, framework-independent,
and reusable without infrastructure dependencies.

Decision

FaultLocalizationEngine exposes pure domain entry points.

The caller supplies:

- immutable NetworkGraph
- immutable pole-state snapshots
- suppression context
- evaluation time
- optional pincode metadata

The engine:

- performs no IO
- performs no persistence
- performs no time lookup
- performs no repository access
- never mutates inputs
- returns immutable outputs

Consequences

- deterministic localization
- testability without infrastructure
- clear separation from orchestration


# AI-WORKFLOW.md

> This document describes how AI was used throughout the development of ElectriFix.
>
> AI was treated as an engineering accelerator rather than an engineering decision-maker.
> Product decisions, architecture, trade-offs and acceptance of generated code remained human-owned throughout the project.

---

# Development Philosophy

This project followed an AI-assisted engineering workflow.

Responsibilities were intentionally separated.

| Responsibility | Owner |
|---------------|-------|
| Product decisions | Human |
| Architecture | Human |
| Trade-offs | Human |
| Documentation | Human |
| Code implementation | AI |
| Code review | Human |
| Final acceptance | Human |

The implementation AI was instructed not to make product or architectural decisions.

Whenever implementation required a design choice outside the existing documentation, development paused until the decision was reviewed and documented.

---

# AI Tools Used

## Primary Coding Assistant

Used for:

- Project scaffolding
- Folder structure
- TypeScript implementation
- React components
- Express routes
- Database schema generation
- Docker configuration
- Tests
- Refactoring

---

## ChatGPT

Used for:

- Product architecture
- Engineering review
- Database modelling
- Documentation
- Design reviews
- Trade-off analysis
- Assignment interpretation
- Localization strategy
- Project planning

ChatGPT was intentionally not used to generate production implementation code.

Instead it acted as the project's technical architect and reviewer.

---

# Engineering Workflow

Every feature followed the same lifecycle.

```
Requirement
        ↓
Discussion
        ↓
Engineering Decision
        ↓
Documentation Update
        ↓
Implementation Specification
        ↓
AI Implementation
        ↓
Human Review
        ↓
Documentation Update
        ↓
Commit
```

This ensured implementation always followed documented design rather than creating documentation afterwards.

---

# Session 1 — Assignment Analysis

## Goal

Understand the assignment before implementation.

## AI Contribution

- Reviewed all six assignment documents.
- Identified the primary evaluation criteria.
- Produced an implementation roadmap.

## Human Decisions
- Reviewed all six assignment documents.
- Documentation-first workflow.
- Highlighted the central engineering challenge (missing topology).
- Architecture frozen before implementation.
- Database design frozen before implementation.
- AI acts as implementation assistant only.

---

# Session 2 — Architecture

## Delegated to AI

- Initial repository structure.
- Initial module decomposition.
- Mermaid diagrams.
- Layer proposal.

## Human Review

The proposed architecture was reviewed and revised before acceptance.

Major revisions included:

- Introduced FaultLocalizationEngine.
- Introduced TopologyResolver abstraction.
- Replaced TelemetryBuffer with EventPipeline.
- Added PoleStateService.
- Added structured explainability (FaultEvidence).
- Reduced unnecessary architectural complexity.
- Added architectural principles.
- Added known limitations.

The architecture was reviewed until internally consistent before being frozen.

---

# Session 3 — Database Design

## Delegated to AI

- Logical schema proposal.
- Entity relationships.
- ER diagram.
- Index suggestions.
- Constraint suggestions.

## Human Review

Multiple changes were made before acceptance.

Examples:

- Removed circular foreign keys.
- Removed duplicate tracking columns.
- Removed suppression metadata from telemetry.
- Separated mutable pole state from immutable telemetry.
- Simplified ticket lifecycle storage.
- Added ownership reasoning.
- Added retention strategy.

The database model was frozen before ORM implementation.

---

# Session 4 — Fault Localization Specification

## Goal

Produce a complete engineering specification for the core business capability before implementation.

## Delegated to AI

- Initial specification structure
- Event flow
- Acceptance scenarios
- Failure scenarios
- Confidence model draft
- Restoration workflow draft

## Human Review

The specification underwent multiple engineering reviews before being frozen.

Major revisions included:

- Introduced configurable Product Policies.
- Added explicit Non Goals.
- Added Engine Invariants.
- Added deterministic confidence rules.
- Made FaultEvidence immutable.
- Separated VerificationPolicy from localization.
- Added localization trigger matrix.
- Added determinism and idempotency guarantees.
- Expanded acceptance scenarios.
- Clarified ownership boundaries.

## Outcome

The localization specification became the implementation contract for the coding assistant.

Implementation is expected to follow this specification without introducing architectural decisions.

---

# Session 5 — API Specification

## Goal

Produce a complete implementation contract for the backend before writing application code.

The specification defines the public API boundary shared between the backend, frontend, simulator, and future implementation agents.

## Delegated to AI

- Initial endpoint catalogue.
- Request and response models.
- WebSocket contract.
- Error contract.
- Interaction flow diagrams.
- Acceptance scenarios.
- Performance targets.

## Human Review

The API specification underwent multiple review iterations before being frozen.

Major revisions included:

- Added API Invariants.
- Added Endpoint Ownership Flow.
- Added Ticket Lifecycle State Machine.
- Expanded module ownership with Reads, Writes, Events, and Dependencies.
- Added AI API Principles.
- Introduced Error Philosophy.
- Replaced hardcoded operational values with Product Policy references.
- Added Future Extension Points.
- Added Cross-Reference Matrix.
- Added Implementation Checklist.

## Outcome

The API specification became the implementation contract for all backend development.

Future implementation is expected to conform to this specification rather than introducing new API behaviour.

---

# Session 6 — Implementation Planning

## Goal

Transform the frozen specifications into an executable engineering roadmap that another implementation agent can follow without introducing new architectural decisions.

## Delegated to AI

- Initial phase decomposition.
- Dependency graph.
- Suggested implementation order.
- Phase acceptance criteria.
- Testing milestones.
- Documentation milestones.
- Commit strategy.

## Human Review

The implementation plan was extensively reviewed before being frozen.

Major revisions included:

- Reorganized work into dependency-driven phases.
- Added explicit phase completion criteria.
- Added testing requirements for every phase.
- Added documentation update requirements for every phase.
- Added implementation risks and future-phase notes.
- Added suggested commit boundaries.
- Ensured every phase references the frozen engineering specifications instead of redefining behaviour.

## Outcome

`IMPLEMENTATION-PLAN.md` became the execution contract for the remainder of the project.

Future implementation follows this plan rather than deciding implementation order during development.

---

# Session 7 — Database Implementation

## Goal

Implement the frozen database specification exactly as documented without introducing architectural drift or undocumented schema changes.

## Delegated to AI

- Drizzle schema implementation.
- Migration generation.
- Database startup hook.
- Idempotent seed generator.
- Seed dataset generation.
- Database integration tests.
- Seed-shape and constraint tests.

## Human Review

Implementation paused multiple times because the frozen specifications contained ambiguities that affected the schema.

Instead of making assumptions, implementation stopped until each issue was reviewed and resolved.

The following engineering decisions were explicitly approved before implementation:

- Standardized UUID generation on UUIDv7.
- Changed telemetry foreign key deletion behavior to `ON DELETE RESTRICT`.
- Made scheduled outage activity runtime-derived rather than persisted.
- Adopted relative-time outage windows for seeded data.
- Distinguished `NO_DEVICE` from `OFFLINE` for device health.

The completed implementation was manually verified using Docker Compose, PostgreSQL inspection, migration verification, and seeded row-count validation.

## Outcome

Phase 1 produced a fully reproducible database foundation consisting of:

- Complete Drizzle schema.
- Automatic migrations.
- Idempotent startup seeding.
- Realistic subdivision dataset.
- PostgreSQL integration tests.
- Seed validation tests.

The implementation remained fully aligned with the frozen architecture and database specifications before any domain behavior was introduced.

---

# Session 8 — Shared Contracts and Policies

## Goal

Implement the canonical shared domain contracts, centralized runtime policies, validation models, and reusable fixtures before introducing domain behavior.

## Delegated to AI

- Shared domain contracts.
- Canonical enums.
- FaultEvidence contract.
- Product policy module.
- Zod validation schemas.
- Topology fixtures.
- Contract and fixture tests.

## Human Review

Implementation paused to resolve specification ambiguities before introducing shared contracts.

The implementation was reviewed to ensure:

- every documented enum exists exactly once
- FaultEvidence matches the Localization, Database, and API specifications
- policy values remain centralized
- simulator options remain intentionally opaque
- topology contracts remain representation-only rather than algorithmic

During review, several convenience names were rejected because they drifted from the frozen specifications.

The implementation was revised to use the documented vocabulary exactly.

## Outcome

Phase 2 established the shared language of the system.

Future phases are expected to import these canonical contracts rather than defining local equivalents.

---

# Session 9 — Repository Adapters and Startup Bootstrap

## Goal

Implement lean persistence adapters and startup loading while preserving the ownership boundaries defined by the architecture.

## Delegated to AI

- Drizzle connection management.
- Repository adapters.
- Bootstrap loading.
- Transaction helper.
- Repository integration tests.
- Bootstrap validation tests.

## Human Review

Implementation paused before development to clarify:

- startup validation scope
- dependency injection strategy
- transaction ownership

The implementation was reviewed to ensure:

- repositories remain infrastructure only
- registry data remains immutable
- business logic does not enter repositories
- startup validates structural integrity rather than seed counts
- transaction support remains persistence-only

During verification, integration tests were initially discovered to be conditionally skipped because TEST_DATABASE_URL was not supplied through Docker Compose. The environment configuration was corrected so the standard container test command executes the complete repository and database integration suite without manual intervention.

Generic repository abstractions and global startup state were intentionally rejected.

## Outcome

Phase 3 established the persistence boundary for the application.

Future application use cases will orchestrate these repositories without directly depending on Drizzle or database infrastructure.

---

# Session 10 — Topology Resolution

## Goal

Implement the topology abstraction that allows future localization to operate independently of how network topology is obtained.

## Delegated to AI

- NetworkGraph implementation.
- TopologyResolver abstraction.
- Recorded topology validation.
- Fallback topology.
- Immutable graph cache.
- Traversal tests.

## Human Review

Implementation paused before development to resolve:

- resolver input
- graph root representation
- topology metadata

The implementation was reviewed to ensure:

- graphs remain immutable
- recorded topology is validated rather than repaired
- fallback topology never invents pole-to-pole relationships
- inferred topology remains intentionally deferred
- localization behavior is not introduced into the topology layer

## Outcome

Phase 4 established the topology abstraction that future localization will consume without depending on repositories or registry structure.

---

# Session 11 — Pole State Service

## Goal

Implement the single owner of current network state while preserving the architectural separation between state management, telemetry processing, and localization.

## Delegated to AI

- PoleStateService implementation.
- Startup cache rebuild.
- State persistence.
- Transition publication.
- Unit and integration tests.

## Human Review

Implementation paused before development to clarify:

- cache/persistence ordering
- boot sequence handling
- device health ownership
- transition publication interface

The implementation was reviewed to ensure:

- PoleStateService remains the sole owner of mutable pole state
- persistence occurs before cache mutation
- duplicate state transitions are suppressed
- health policy remains outside this phase
- downstream behavior is not invoked

## Outcome

Phase 5 established the runtime state owner that future EventPipeline and FaultLocalizationEngine phases will consume.

---

# Session 12 — Noise Filters and Scheduled Outage Suppression

## Goal

Implement deterministic false-positive controls before localization while preserving strict ownership boundaries between state management, filtering, and localization.

## Delegated to AI

- Debouncer.
- DeadSensorDetector.
- ScheduledOutageFilter.
- ScheduledOutageClient.
- Shared filter result contract.
- Unit and integration tests.

## Human Review

Implementation paused before development to resolve:

- Debouncer ownership
- PRESUMED_DARK workflow
- shared filter result contract
- device health ownership

The implementation was reviewed to ensure:

- filters remain pure decision components
- PoleStateService remains the only owner of mutable state
- scheduled outages suppress but never create faults
- dead sensor detection does not modify health
- localization remains completely outside this phase

## Outcome

Phase 6 established deterministic noise filtering that future EventPipeline and FaultLocalizationEngine phases will consume without coupling filtering to state management or localization.

---

# Session 13 — Telemetry Stream Identity Review

## Goal

Resolve the contradiction between sequence resets on device reboot and duplicate detection based only on `device_id + seq` before telemetry ingestion implementation began.

## Contradiction Discovered

The firmware resets `seq` after every boot, while the frozen database and API contracts treated `(device_id, seq)` as globally unique. A new event after reboot could therefore be indistinguishable from a delayed retry from an earlier device generation.

## Engineering Review

AI re-read the frozen specifications and assignment documents, traced the behavior through persistence, ingest, pole state, simulator, localization, tests, and future phases, and performed an indistinguishability analysis for lost boot events and delayed retries.

## Alternatives Evaluated

- `device_id + seq` uniqueness.
- Server-managed device sessions.
- Timestamps or device time as ordering and session evidence.
- A firmware-provided telemetry stream discriminator.

## Why Backend-Only Resolution Is Impossible

With no generation identifier, a new post-reboot event following a lost boot and a delayed retry from the prior session can have identical backend-visible fields. `received_at` describes delivery time rather than source identity, and device timestamps are explicitly untrusted for ordering. No backend-only rule can correctly accept the first event and reject the second in every permitted scenario.

## Accepted Correction

The human owner accepted `boot_counter`: a persistent device reboot counter carried by every telemetry event. The canonical identity is `(device_id, boot_counter, seq)` and `(boot_counter, seq)` is strictly monotonic in lexicographic order for a device.

## Rejected Example

Server-managed sessions were rejected because a lost or delayed boot cannot be deterministically associated with the correct server session. Persisting session state survives a server restart but cannot recreate protocol information that the device did not send.

## Outcome

The frozen specifications were corrected before Phase 7 implementation. No code, source files, or tests were changed during this review.

---

# Session 14 — Phase 7 EventPipeline

## Goal

Implement the production telemetry ingestion pipeline while preserving the approved ordering, buffering, persistence, and ownership boundaries.

## Delegated to AI

- Thin ingestion orchestrator.
- Fixed FIFO ring buffer.
- Tuple ordering using `(boot_counter, seq)`.
- Admission-only batch counts.
- UUIDv7 identifiers.
- Pipeline-local tuple comparison.
- Focused route, integration, and burst tests.

## Human Review

The following AI proposals were accepted:

- Thin orchestration.
- UUIDv7.
- FIFO buffer.
- 50 ms drain.
- 8,192 capacity.
- `503` overload response.
- Admission-only batch semantics.
- Pipeline-local lexicographic comparison.
- Device-to-pole business validation.

The following proposals were rejected:

- Distributed transactions.
- Retry queues.
- Background recovery infrastructure.
- Localization coupling.
- WebSocket delivery.
- Generic event bus.

Post-review, a pending ordering cursor was found to persist beyond queue completion.

Root cause: the temporary admission cursor was never cleared after processing.

The approved correction was deliberately narrow: clear the pending cursor only when the completed tuple still matches the current pending cursor. This preserves protection for newer queued telemetry while restoring the durable pole-state cursor as the sole ordering authority after the queue drains.

## Outcome

Phase 7 produced the telemetry ingest path with UUIDv7 identifiers, tuple-aware duplicate and stale handling, device-to-pole validation, asynchronous FIFO admission, and focused route, integration, and burst coverage.

The pending-cursor correction ensured that in-memory admission state exists only while queued telemetry remains. The focused A → B → C test verifies that a newer queued cursor remains while A and B finish, then is cleared when C completes.

No new engineering decisions were required.

---

# Session 15 — Fault Localization Engine

## Goal

Implement the deterministic fault localization engine as a pure domain capability while preserving the ownership boundaries defined by the architecture.

## Delegated to AI

- BoundaryFinder implementation.
- FaultGrouper implementation.
- ConfidenceScorer implementation.
- FaultLocalizationEngine orchestration.
- Immutable FaultEvidence assembly.
- Domain fixture generation.
- Localization scenario tests.

## Human Review

Implementation paused before development to resolve:

- feeder-level localization input
- pincode ownership
- suppression context contract
- deterministic evaluation time
- DT-wide darkness with UNKNOWN poles
- canonical affected-poles contract

The implementation was reviewed to ensure:

- localization remains pure domain logic
- the engine imports no infrastructure or presentation modules
- topology, pole state, suppression context, metadata, and evaluation time remain caller-supplied immutable inputs
- confidence is derived only from the documented deterministic rules
- fallback topology never produces false span precision
- outputs and evidence remain immutable
- graph traversal remains linear for normal radial distribution transformer networks

During verification, several implementation defects were identified and corrected before acceptance:

- descendant boundaries were incorrectly treated as independent fault boundaries
- equivalent boundaries incorrectly replaced direct physical boundaries during grouping
- DT-wide confidence incorrectly treated UNKNOWN poles without telemetry devices as negative evidence
- repeated graph scans were replaced with indexed lookups to preserve linear traversal complexity

## Outcome

Phase 8 established the deterministic localization engine used by future orchestration phases.

The engine localizes recorded span faults, distribution-transformer faults, feeder-level faults, fallback topology, and multiple simultaneous faults using immutable caller-supplied inputs.

Confidence scoring, fault grouping, and evidence generation remain completely deterministic and independent of infrastructure, persistence, HTTP, WebSockets, simulator behavior, and ticket lifecycle.

Future phases will orchestrate this engine without introducing localization logic outside the domain layer.

---

# Session 14 — Fault and Ticket Creation Use Case

## Goal

Implement the application orchestration layer that connects meaningful pole-state transitions to deterministic localization, transactional fault and ticket persistence, merge behavior, and internal domain event publication while preserving the ownership boundaries established in earlier phases.

## Delegated to AI

- localize-faults application use case.
- Transition subscription wiring.
- Suppression context assembly.
- Fault localization orchestration.
- Fault and ticket persistence.
- Active fault merge behavior.
- Internal domain event publication.
- Unit and integration tests.

## Human Review

Implementation paused before development to resolve:

- active fault identity
- immutable evidence merge behavior
- suppression context construction
- DT versus feeder localization orchestration
- deterministic evaluation time

The implementation was reviewed to ensure:

- Phase 9 remains an application orchestration layer
- FaultLocalizationEngine remains pure domain logic
- repositories remain persistence adapters only
- FaultEvidence remains immutable
- one physical fault produces one active fault and one ticket
- transactional persistence prevents orphan faults or tickets
- localization remains independent of HTTP and EventPipeline

## Outcome

Phase 9 established the application orchestration layer that connects PoleStateService transitions to deterministic localization, fault persistence, ticket creation, merge behavior, and internal domain events without violating the ownership boundaries established in earlier phases.

---

# Session 15 — Ticket Lifecycle and Restoration Verification

## Goal

Implement the operational ticket lifecycle and telemetry-based restoration verification while preserving the ownership boundaries between ticket workflow, state management, and localization.

## Delegated to AI

- TicketLifecycle.
- RestorationVerifier.
- manage-ticket application use case.
- Lifecycle persistence.
- Restoration verification.
- Unit and integration tests.

## Human Review

Implementation paused before development to resolve:

- verification hold period
- automatic closure ownership

The implementation was reviewed to ensure:

- TicketLifecycle remains the sole owner of ticket transitions
- RestorationVerifier uses immutable PoleStateService snapshots only
- repositories remain persistence adapters
- manual actions cannot bypass telemetry verification
- automatic VERIFIED → CLOSED behavior remains deferred

## Decisions

Approved:

- Phase 10 ends at VERIFIED.
- VERIFIED → CLOSED is deferred until a future scheduler-capable phase.
- No timers or background workers are introduced.
- CLOSED remains a valid lifecycle state but is unreachable during Phase 10.

## Outcome

Phase 10 established the operational ticket workflow and telemetry-based restoration verification while preserving deterministic lifecycle ownership and leaving automatic closure for a later scheduler-capable phase.

---

# Session 16 — Simulator Engine and Simulator API

## Goal

Implement a production-faithful simulator that generates telemetry exclusively through the production ingestion pipeline and expose it through the documented REST API.

## Delegated to AI

- Simulator engine
- NetworkGenerator
- FaultInjector
- TelemetryProducer
- NoiseGenerator
- RepairExecutor
- RunSimulation
- Simulator REST routes
- Unit, route, integration, and database-backed tests

## Human Review

Implementation paused before development to resolve:

- firmware 1.2 silence ownership
- dead sensor ownership
- fallback span behavior
- simulation completion semantics
- deterministic default target selection
- noise repetition semantics

The implementation was reviewed to ensure:

- simulator produces telemetry only
- no direct writes to telemetry, pole state, faults, or tickets
- EventPipeline remains the sole ingestion path
- repair increments boot_counter and emits boot followed by power_restored
- simulator routes remain thin transport adapters
- simulation completion is admission-based
- repair verification occurs through the normal production workflow

## Outcome

Phases 11–12 established a production-faithful simulator and REST API that exercise the complete telemetry, localization, fault, and ticket workflow through the existing production pipeline without introducing simulator backdoors or bypassing architectural boundaries.

---

# Session 17 — REST API Completion

## Goal

Complete the documented REST API surface while preserving strict separation between presentation, application, domain, and persistence layers.

## Delegated to AI

- Read application use cases.
- REST route implementation.
- Shared serializers.
- Unified error middleware.
- API contract tests.
- Pagination, filtering, and sorting.
- Config serialization.

## Human Review

Implementation paused before development to resolve:

- GET /api/config serialization contract
- presentation/application ownership
- serializer boundary
- repository read responsibilities

The implementation was reviewed to ensure:

- routes remain transport-only
- application use cases own orchestration
- repositories remain persistence adapters
- serializers prevent database model leakage
- unified error contract matches API specification
- canonical policies remain internal while presentation serializes the documented response

## Outcome

Phase 13 completed the documented REST API surface and established a deterministic presentation boundary for frontend integration.

---

# Session 18 — WebSocket Live Updates

## Goal

Implement real-time operator updates while preserving REST as the authoritative source of truth and keeping WebSocket as a transport-only notification layer.

## Delegated to AI

- WebSocket server.
- Transport emitter.
- Live update dispatcher.
- DT-scoped batching.
- Reconnect hook.
- Nginx integration.
- WebSocket tests.
- Client reconnect tests.

## Human Review

Implementation paused before development to resolve:

- simulation.started nullable payload fields
- DT batching boundary
- WebSocket runtime dependency

The implementation was reviewed to ensure:

- WebSocket remains transport-only
- existing producers remain unchanged
- REST remains authoritative
- no replay or persistence is introduced
- per-entity ordering is preserved
- pole.state_changed batching occurs once per DT per event-loop cycle
- reconnect recommends REST refetch
- transport introduces no business logic

## Outcome

Phase 14 established real-time event delivery over WebSocket while preserving the existing application, domain, and persistence ownership boundaries.

---

# Session 19 — Operator Dashboard

## Goal

Build a reviewer-facing operator console that makes the existing fault,
topology, evidence, ticket, simulator, REST, and WebSocket contracts usable
without moving business decisions into the client.

## Delegated to AI

- React application shell and operational dashboard layout.
- Typed REST client and React Query cache integration.
- Leaflet/OpenStreetMap incident map.
- Fault evidence, confidence, ticket action, and simulator components.
- WebSocket notification integration with REST refetch and polling fallback.
- Component, hook, API-client, build, lint, and visual smoke verification.

## Human Review

The implementation was constrained to presentation ownership. The review
confirmed that:

- REST remains the authoritative source of truth.
- WebSocket events only invalidate/refetch client data and are never replayed.
- Ticket controls recommend the next action but rely on backend lifecycle
  validation and surface `409` responses.
- Recorded, inferred, and fallback topology are visibly distinct, with fallback
  never rendered as an exact span.
- Null AI summaries and unavailable evidence values remain explicit to the
  operator.
- Simulator controls invoke only documented REST operations.

## Outcome

Phase 15 provides a responsive incident console with DT-scoped map reads,
operator evidence, ticket actions, simulator controls, and resilient live-data
refreshing. The client remains presentation-only and introduces no business or
domain behavior.

---

# Examples of AI Output That Was Rejected

## Example 1

The initial architecture introduced unnecessary repository abstractions and enterprise patterns.

Reason rejected:

The assignment did not require this complexity.

Simplified to a lean architecture.

---

## Example 2

Initial localization modules exposed several disconnected services.

Reason rejected:

Localization is one business capability.

Introduced a single FaultLocalizationEngine responsible for orchestration.

---

## Example 3

Database initially proposed bidirectional Fault ↔ Ticket relationships.

Reason rejected:

Created circular ownership.

Replaced with one-way ownership using tickets.fault_id.

---

## Example 4

The initial localization specification mixed restoration policy with localization logic.

Reason rejected:

Restoration thresholds are operational policy, not localization behaviour.

Verification responsibility was moved into RestorationVerifier and exposed through VerificationPolicy.

---

## Example 5

The initial API specification focused primarily on endpoint definitions.

Reason rejected:

An API specification should define behavioural contracts, ownership boundaries, lifecycle guarantees, interaction flows, invariants, and implementation expectations—not merely a list of routes.

The document was expanded into a complete engineering contract before implementation.

---

## Example 6

The initial seed proposal represented poles without installed telemetry hardware as `OFFLINE`.

### Reason Rejected

A pole without a telemetry device is fundamentally different from a pole with an installed device that has stopped communicating.

The domain model was revised to introduce a distinct `NO_DEVICE` device-health state, preserving the semantic distinction between hardware absence and hardware failure.

---

## Example 7

The initial implementation introduced convenience enum values and contract field names that differed from the frozen specifications.

### Reason Rejected

Shared contracts represent the canonical language of the system.

Even small naming differences would introduce drift between the Architecture, Database Design, Localization Specification, API Specification, and implementation.

The implementation was revised to use the documented vocabulary exactly.

---

## Example 8

The initial repository proposal introduced generic repository abstractions and globally accessible startup state.

### Reason Rejected

The architecture intentionally favors explicit, ownership-oriented repositories over generic abstractions.

Repository responsibilities were reduced to infrastructure persistence only, and startup data was exposed through dependency injection rather than global state.

---

## Example 9

The initial implementation considered introducing inferred topology heuristics and additional quality metadata.

### Reason Rejected

The frozen architecture explicitly defers inferred topology.

Implementing heuristic reconstruction would introduce undocumented product behavior and architectural decisions.

The implementation was limited to recorded and fallback topology only.

---

## Example 10

The initial implementation considered updating device health from heartbeat events and introducing framework-specific event publication.

### Reason Rejected

Device health transitions belong to later policy phases.

Transition publication remains a framework-independent in-process contract so future layers can subscribe without introducing transport or infrastructure coupling.

---

## Example 11

The initial implementation considered allowing Debouncer to directly invoke PoleStateService and update device health during dead sensor detection.

### Reason Rejected

Noise filters are pure decision components.

Mutable state remains owned exclusively by PoleStateService.

EventPipeline will orchestrate state changes in later phases.

---

# AI Usage Principles

The following responsibilities were intentionally kept human-owned:

- Product behaviour
- Trade-offs
- Architecture
- Assignment interpretation
- Database modelling
- Localization strategy
- Confidence model
- Explainability
- Acceptance criteria

The following responsibilities were delegated to AI:

- Implementation
- Refactoring
- Boilerplate generation
- Repetitive TypeScript
- React UI generation
- Drizzle schema generation
- Docker configuration
- Tests

---

# Estimated AI Contribution

Approximately:

- Documentation: Human
- Architecture: Human-guided with AI review
- Database Design: Human-guided with AI review
- Implementation: Primarily AI-generated
- Final Review: Human

The exact percentage of AI-generated code is intentionally not estimated because extensive review and revision occurred throughout development.

---

# Lessons Learned

The highest leverage use of AI was not generating code.

It was rapidly iterating on architectural ideas while keeping product ownership with the human engineer.

Maintaining documentation before implementation significantly reduced design drift and made implementation decisions easier to validate.

Freezing the Architecture, Database Design, Localization Specification, and API Specification before implementation created stable engineering contracts that future implementation could follow without introducing new architectural decisions.

Freezing engineering specifications before implementation significantly reduced implementation ambiguity. Whenever the implementation encountered conflicting or incomplete specifications, development paused until the engineering decision was reviewed and documented rather than allowing assumptions to enter the codebase.

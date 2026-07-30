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
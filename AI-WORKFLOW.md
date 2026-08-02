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

Generic repository abstractions and global startup state were intentionally rejected.

## Outcome

Phase 3 established the persistence boundary for the application.

Future application use cases will orchestrate these repositories without directly depending on Drizzle or database infrastructure.

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
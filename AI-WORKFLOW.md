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
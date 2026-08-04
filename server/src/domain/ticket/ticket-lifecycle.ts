import type { TicketLifecycleState, TicketLifecycleUpdate } from "./types.js";
import type { RestorationVerificationResult } from "./types.js";

export class TicketLifecycleError extends Error {
  constructor(
    readonly action: "acknowledge" | "assign" | "resolve" | "verify",
    readonly currentStatus: TicketLifecycleState["status"],
  ) {
    super(`Cannot ${action} ticket: current status is '${currentStatus}'`);
    this.name = "TicketLifecycleError";
  }
}

/** Pure state machine for documented ticket lifecycle transitions. */
export class TicketLifecycle {
  acknowledge(
    ticket: TicketLifecycleState,
    occurredAt: Date,
    operatorNotes?: string,
  ): TicketLifecycleUpdate {
    this.requireStatus(ticket, "acknowledge", ["detected"]);
    return Object.freeze({
      status: "acknowledged",
      operatorNotes: operatorNotes ?? ticket.operatorNotes,
      acknowledgedAt: cloneDate(occurredAt),
      updatedAt: cloneDate(occurredAt),
    });
  }

  assign(
    ticket: TicketLifecycleState,
    occurredAt: Date,
    assignedCrew: string,
    operatorNotes?: string,
  ): TicketLifecycleUpdate {
    this.requireStatus(ticket, "assign", ["acknowledged"]);
    if (assignedCrew.trim().length === 0) {
      throw new Error("Assigned crew must not be empty");
    }
    return Object.freeze({
      status: "crew_assigned",
      assignedCrew,
      operatorNotes: operatorNotes ?? ticket.operatorNotes,
      crewAssignedAt: cloneDate(occurredAt),
      updatedAt: cloneDate(occurredAt),
    });
  }

  resolve(
    ticket: TicketLifecycleState,
    occurredAt: Date,
    operatorNotes?: string,
  ): TicketLifecycleUpdate {
    this.requireStatus(ticket, "resolve", ["crew_assigned"]);
    return Object.freeze({
      status: "resolved",
      operatorNotes: operatorNotes ?? ticket.operatorNotes,
      resolvedAt: cloneDate(occurredAt),
      updatedAt: cloneDate(occurredAt),
    });
  }

  verify(
    ticket: TicketLifecycleState,
    verification: RestorationVerificationResult,
    occurredAt: Date,
  ): TicketLifecycleUpdate {
    if (!verification.verified) {
      throw new Error("Cannot verify ticket: restoration is not verified");
    }
    this.requireStatus(ticket, "verify", [
      "detected",
      "acknowledged",
      "crew_assigned",
      "resolved",
    ]);
    return Object.freeze({
      status: "verified",
      verifiedAt: cloneDate(occurredAt),
      updatedAt: cloneDate(occurredAt),
    });
  }

  rejectResolution(
    ticket: TicketLifecycleState,
    occurredAt: Date,
    reason: string,
  ): TicketLifecycleUpdate {
    this.requireStatus(ticket, "resolve", ["crew_assigned", "resolved"]);
    return Object.freeze({
      status: "crew_assigned",
      rejectionCount: ticket.rejectionCount + 1,
      rejectionReason: reason,
      resolvedAt: null,
      updatedAt: cloneDate(occurredAt),
    });
  }

  private requireStatus(
    ticket: TicketLifecycleState,
    action: TicketLifecycleError["action"],
    allowed: readonly TicketLifecycleState["status"][],
  ): void {
    if (!allowed.includes(ticket.status)) {
      throw new TicketLifecycleError(action, ticket.status);
    }
  }
}

function cloneDate(value: Date): Date {
  return new Date(value.getTime());
}

import { describe, expect, it } from "vitest";

import {
  TicketLifecycle,
  TicketLifecycleError,
} from "../src/domain/ticket/ticket-lifecycle.js";
import { RestorationVerifier } from "../src/domain/ticket/restoration-verifier.js";
import type { TicketLifecycleState } from "../src/domain/ticket/types.js";
import type { PoleState } from "../src/domain/pole-state/types.js";

const at = new Date("2026-08-05T12:00:00.000Z");

describe("TicketLifecycle", () => {
  it("enforces the documented operator and telemetry transitions through VERIFIED", () => {
    const lifecycle = new TicketLifecycle();
    const detected = ticket("detected");
    const acknowledged = apply(
      detected,
      lifecycle.acknowledge(detected, at, "Investigating"),
    );
    const assigned = apply(
      acknowledged,
      lifecycle.assign(acknowledged, at, "Crew-7"),
    );
    const resolved = apply(assigned, lifecycle.resolve(assigned, at));

    expect(acknowledged.status).toBe("acknowledged");
    expect(assigned).toMatchObject({
      status: "crew_assigned",
      assignedCrew: "Crew-7",
    });
    expect(resolved.status).toBe("resolved");
    expect(
      lifecycle.verify(resolved, successfulVerification(), at),
    ).toMatchObject({
      status: "verified",
      verifiedAt: at,
    });
    expect(
      lifecycle.verify(detected, successfulVerification(), at).status,
    ).toBe("verified");
  });

  it("rejects invalid transitions and does not implement VERIFIED to CLOSED", () => {
    const lifecycle = new TicketLifecycle();

    for (const status of [
      "acknowledged",
      "crew_assigned",
      "resolved",
      "verified",
      "closed",
    ] as const) {
      expect(() => lifecycle.acknowledge(ticket(status), at)).toThrow(
        TicketLifecycleError,
      );
    }
    for (const status of [
      "detected",
      "crew_assigned",
      "resolved",
      "verified",
      "closed",
    ] as const) {
      expect(() => lifecycle.assign(ticket(status), at, "Crew-7")).toThrow(
        TicketLifecycleError,
      );
    }
    for (const status of [
      "detected",
      "acknowledged",
      "resolved",
      "verified",
      "closed",
    ] as const) {
      expect(() => lifecycle.resolve(ticket(status), at)).toThrow(
        TicketLifecycleError,
      );
    }
    expect(() => lifecycle.acknowledge(ticket("verified"), at)).toThrow(
      "Cannot acknowledge ticket: current status is 'verified'",
    );
    expect("close" in lifecycle).toBe(false);
  });

  it("rejects verification unless RestorationVerifier confirms restoration", () => {
    const lifecycle = new TicketLifecycle();
    const verification = new RestorationVerifier({
      verificationThreshold: 0.8,
    }).verify({
      affectedPoleIds: ["P-1", "P-2"],
      poleStates: [poleState("P-1", "LIVE"), poleState("P-2", "DARK")],
    });

    expect(verification.verified).toBe(false);
    expect(() =>
      lifecycle.verify(ticket("detected"), verification, at),
    ).toThrow("Cannot verify ticket: restoration is not verified");
  });

  it("returns a rejected resolution to crew_assigned with the documented fields", () => {
    const lifecycle = new TicketLifecycle();
    const rejected = lifecycle.rejectResolution(
      ticket("resolved", { rejectionCount: 2, resolvedAt: at }),
      at,
      "2 of 4 affected poles still dark.",
    );

    expect(rejected).toMatchObject({
      status: "crew_assigned",
      rejectionCount: 3,
      rejectionReason: "2 of 4 affected poles still dark.",
      resolvedAt: null,
    });
  });
});

function ticket(
  status: TicketLifecycleState["status"],
  overrides: Partial<TicketLifecycleState> = {},
): TicketLifecycleState {
  return {
    ticketId: "T-1",
    status,
    assignedCrew: null,
    operatorNotes: null,
    rejectionCount: 0,
    rejectionReason: null,
    acknowledgedAt: null,
    crewAssignedAt: null,
    resolvedAt: null,
    verifiedAt: null,
    closedAt: null,
    updatedAt: at,
    ...overrides,
  };
}

function apply(
  ticketState: TicketLifecycleState,
  update: ReturnType<TicketLifecycle["acknowledge"]>,
): TicketLifecycleState {
  return { ...ticketState, ...update };
}

function successfulVerification() {
  return new RestorationVerifier({ verificationThreshold: 0.8 }).verify({
    affectedPoleIds: ["P-1"],
    poleStates: [poleState("P-1", "LIVE")],
  });
}

function poleState(
  poleId: string,
  energized: PoleState["energized"],
): PoleState {
  return {
    poleId,
    energized,
    lastHeartbeatAt: null,
    lastEventAt: null,
    lastBootCounter: null,
    lastSeq: null,
    firmwareVersion: null,
    deviceHealth: "HEALTHY",
    hasDevice: true,
    batteryMv: null,
    rssi: null,
    updatedAt: at,
  };
}

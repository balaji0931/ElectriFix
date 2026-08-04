import { describe, expect, it } from "vitest";

import { ManageTicket } from "../src/application/manage-ticket.js";
import type { LocalizationEvent } from "../src/application/localize-faults.js";
import { RestorationVerifier } from "../src/domain/ticket/restoration-verifier.js";
import { TicketLifecycle } from "../src/domain/ticket/ticket-lifecycle.js";
import type { PoleState } from "../src/domain/pole-state/types.js";
import type {
  FaultPersistenceModel,
  TicketPersistenceModel,
  TicketPersistenceUpdate,
  TicketWithFault,
  VerifiedTicketAndFault,
} from "../src/infrastructure/repositories/ticket-repository.js";

const at = new Date("2026-08-05T12:00:00.000Z");

describe("ManageTicket", () => {
  it("rejects a premature crew resolution with the documented count and reason", async () => {
    const fixture = createFixture(
      "crew_assigned",
      [state("P-1", "LIVE"), state("P-2", "LIVE"), state("P-3", "DARK")],
      ["P-1", "P-2", "P-3"],
    );

    const result = await fixture.useCase.resolve("T-1", { occurredAt: at });

    expect(result).toMatchObject({
      status: "crew_assigned",
      rejectionCount: 1,
      rejectionReason: "1 of 3 affected poles still dark.",
      resolvedAt: null,
    });
    expect(fixture.events).toMatchObject([
      { type: "ticket.updated", previousStatus: "crew_assigned" },
    ]);
  });

  it("auto-verifies restoration before acknowledgement and resolves the fault atomically", async () => {
    const fixture = createFixture("detected", [
      state("P-1", "LIVE"),
      state("P-2", "LIVE"),
    ]);

    await fixture.useCase.handlePoleStateTransition({
      previousState: state("P-1", "DARK"),
      currentState: state("P-1", "LIVE"),
    });

    expect(fixture.store.record.ticket).toMatchObject({
      status: "verified",
      verifiedAt: at,
    });
    expect(fixture.store.record.fault).toMatchObject({
      status: "resolved",
      resolvedAt: at,
    });
    expect(fixture.events.map((event) => event.type)).toEqual([
      "ticket.updated",
      "fault.updated",
    ]);
  });

  it("verifies a crew resolution only when current pole state meets the threshold", async () => {
    const fixture = createFixture("crew_assigned", [
      state("P-1", "LIVE"),
      state("P-2", "LIVE"),
    ]);

    const result = await fixture.useCase.resolve("T-1", { occurredAt: at });

    expect(result).toMatchObject({ status: "verified", verifiedAt: at });
    expect(fixture.store.record.fault).toMatchObject({
      status: "resolved",
      resolvedAt: at,
    });
  });

  it("persists valid acknowledge and assign commands through the lifecycle", async () => {
    const fixture = createFixture("detected", [
      state("P-1", "DARK"),
      state("P-2", "DARK"),
    ]);

    await fixture.useCase.acknowledge("T-1", {
      occurredAt: at,
      operatorNotes: "Investigating",
    });
    const assigned = await fixture.useCase.assign("T-1", {
      occurredAt: at,
      assignedCrew: "Crew-7",
    });

    expect(assigned).toMatchObject({
      status: "crew_assigned",
      assignedCrew: "Crew-7",
      operatorNotes: "Investigating",
    });
  });
});

function createFixture(
  status: TicketPersistenceModel["status"],
  states: readonly PoleState[],
  affectedPoleIds = ["P-1", "P-2"],
) {
  const store = new MemoryTicketStore(status, affectedPoleIds);
  const poleStates = new Map(
    states.map((poleState) => [poleState.poleId, poleState]),
  );
  const events: LocalizationEvent[] = [];
  const useCase = new ManageTicket({
    ticketStore: store,
    poleStateReader: { getPoleState: (poleId) => poleStates.get(poleId) },
    ticketLifecycle: new TicketLifecycle(),
    restorationVerifier: new RestorationVerifier({
      verificationThreshold: 0.8,
    }),
    publisher: { publish: (event) => events.push(event) },
  });

  return { useCase, store, events };
}

class MemoryTicketStore {
  record: TicketWithFault;

  constructor(
    status: TicketPersistenceModel["status"],
    affectedPoleIds: readonly string[],
  ) {
    this.record = {
      ticket: ticket(status),
      fault: fault(affectedPoleIds),
    };
  }

  async findTicketWithFault(
    ticketId: string,
  ): Promise<TicketWithFault | undefined> {
    return this.record.ticket.ticketId === ticketId ? this.record : undefined;
  }

  async listRestorableTicketsWithFaults(): Promise<
    ReadonlyArray<TicketWithFault>
  > {
    return this.record.fault.status === "active" ? [this.record] : [];
  }

  async updateTicket(
    ticketId: string,
    update: TicketPersistenceUpdate,
  ): Promise<TicketPersistenceModel | undefined> {
    if (ticketId !== this.record.ticket.ticketId) {
      return undefined;
    }
    this.record = {
      ...this.record,
      ticket: { ...this.record.ticket, ...update },
    };
    return this.record.ticket;
  }

  async verifyTicketAndResolveFault(
    ticketId: string,
    faultId: string,
    update: TicketPersistenceUpdate,
    verifiedAt: Date,
  ): Promise<VerifiedTicketAndFault> {
    if (
      ticketId !== this.record.ticket.ticketId ||
      faultId !== this.record.fault.faultId
    ) {
      throw new Error("Unexpected ticket or fault");
    }
    this.record = {
      ticket: { ...this.record.ticket, ...update },
      fault: {
        ...this.record.fault,
        status: "resolved",
        resolvedAt: verifiedAt,
        updatedAt: verifiedAt,
      },
    };
    return this.record;
  }
}

function ticket(
  status: TicketPersistenceModel["status"],
): TicketPersistenceModel {
  return {
    ticketId: "T-1",
    faultId: "F-1",
    status,
    assignedCrew: null,
    operatorNotes: null,
    rejectionCount: 0,
    rejectionReason: null,
    detectedAt: at,
    acknowledgedAt: null,
    crewAssignedAt: null,
    resolvedAt: null,
    verifiedAt: null,
    closedAt: null,
    createdAt: at,
    updatedAt: at,
  };
}

function fault(affectedPoleIds: readonly string[]): FaultPersistenceModel {
  return {
    faultId: "F-1",
    dtId: "D-1",
    feederId: "F-1",
    faultType: "span",
    status: "active",
    spanPoleA: "P-0",
    spanPoleB: "P-1",
    lat: 0,
    lon: 0,
    pincode: null,
    affectedPoleCount: affectedPoleIds.length,
    confidenceLevel: "HIGH",
    topologySource: "RECORDED",
    evidence: { affected_poles: affectedPoleIds },
    aiSummary: null,
    mergedIntoFaultId: null,
    detectedAt: at,
    resolvedAt: null,
    createdAt: at,
    updatedAt: at,
  };
}

function state(poleId: string, energized: PoleState["energized"]): PoleState {
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

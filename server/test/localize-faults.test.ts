import { describe, expect, it } from "vitest";

import {
  LocalizeFaults,
  type LocalizationEvent,
} from "../src/application/localize-faults.js";
import { defaultProductPolicies } from "../src/config/policies.js";
import { FaultLocalizationEngine } from "../src/domain/localization/fault-localization-engine.js";
import { DeadSensorDetector } from "../src/domain/noise-filter/dead-sensor-detector.js";
import { ScheduledOutageFilter } from "../src/domain/noise-filter/scheduled-outage-filter.js";
import type { ScheduledOutage } from "../src/domain/noise-filter/types.js";
import type {
  PoleState,
  PoleStateTransition,
} from "../src/domain/pole-state/types.js";
import { NetworkGraph } from "../src/domain/topology/network-graph.js";
import type { TopologyResolver } from "../src/domain/topology/topology-resolver.js";
import type { StartupSnapshot } from "../src/infrastructure/db/bootstrap.js";
import type {
  ActiveFaultIdentity,
  ActiveFaultUpdate,
  CreatedFaultAndTicket,
  FaultPersistenceInput,
  FaultPersistenceModel,
  TicketPersistenceInput,
  TicketPersistenceModel,
} from "../src/infrastructure/repositories/ticket-repository.js";

const evaluationTime = new Date("2026-08-05T12:00:00.000Z");

describe("LocalizeFaults", () => {
  it("creates one span fault and one ticket, then merges repeated observations without replacing evidence", async () => {
    const fixture = createFixture({
      source: "RECORDED",
      graphs: [
        graph(
          "D-1",
          "RECORDED",
          ["P-1", "P-2", "P-3"],
          [
            ["P-1", "P-2"],
            ["P-2", "P-3"],
          ],
        ),
      ],
      states: [
        state("P-1", "LIVE"),
        state("P-2", "DARK"),
        state("P-3", "DARK"),
      ],
    });

    await fixture.useCase.handleTransition(darkTransition("P-2"));

    expect(fixture.store.faults).toHaveLength(1);
    expect(fixture.store.tickets).toHaveLength(1);
    expect(fixture.events.map((event) => event.type)).toEqual([
      "fault.created",
      "ticket.created",
    ]);
    expect(fixture.store.faults[0]).toMatchObject({
      faultType: "span",
      status: "active",
      spanPoleA: "P-1",
      spanPoleB: "P-2",
      affectedPoleCount: 2,
      aiSummary: null,
    });
    const originalEvidence = fixture.store.faults[0]!.evidence;

    await fixture.useCase.handleTransition(darkTransition("P-2"));

    expect(fixture.store.faults).toHaveLength(1);
    expect(fixture.store.tickets).toHaveLength(1);
    expect(fixture.store.faults[0]!.evidence).toBe(originalEvidence);
    expect(fixture.events.map((event) => event.type)).toEqual([
      "fault.created",
      "ticket.created",
      "fault.updated",
    ]);
  });

  it("creates a fallback DT fault and preserves its low-confidence evidence", async () => {
    const fixture = createFixture({
      source: "FALLBACK",
      graphs: [
        graph("D-1", "FALLBACK", ["P-1", "P-2"], []),
        graph("D-2", "FALLBACK", ["P-3", "P-4"], []),
      ],
      states: [
        state("P-1", "DARK"),
        state("P-2", "DARK"),
        state("P-3", "LIVE"),
        state("P-4", "LIVE"),
      ],
    });

    await fixture.useCase.handleTransition(darkTransition("P-1"));

    expect(fixture.store.faults).toHaveLength(1);
    expect(fixture.store.faults[0]).toMatchObject({
      faultType: "dt",
      topologySource: "FALLBACK",
      confidenceLevel: "LOW",
      spanPoleA: null,
      spanPoleB: null,
    });
  });

  it("promotes DT-localized symptoms to one feeder fault only when the engine confirms the feeder criterion", async () => {
    const fixture = createFixture({
      source: "FALLBACK",
      graphs: [
        graph("D-1", "FALLBACK", ["P-1", "P-2"], []),
        graph("D-2", "FALLBACK", ["P-3", "P-4"], []),
      ],
      states: [
        state("P-1", "DARK"),
        state("P-2", "DARK"),
        state("P-3", "DARK"),
        state("P-4", "DARK"),
      ],
    });

    await fixture.useCase.handleTransition(darkTransition("P-1"));

    expect(fixture.store.faults).toHaveLength(1);
    expect(fixture.store.faults[0]).toMatchObject({
      faultType: "feeder",
      feederId: "F-1",
      affectedPoleCount: 4,
    });
    expect(fixture.store.tickets).toHaveLength(1);
  });

  it("suppresses a scheduled outage before localization and persists nothing", async () => {
    const fixture = createFixture({
      source: "FALLBACK",
      graphs: [graph("D-1", "FALLBACK", ["P-1", "P-2"], [])],
      states: [state("P-1", "DARK"), state("P-2", "DARK")],
      outages: [
        {
          outageId: "SO-1",
          scope: "dt",
          targetId: "D-1",
          scheduledStart: new Date("2026-08-05T11:00:00.000Z"),
          scheduledEnd: new Date("2026-08-05T13:00:00.000Z"),
          reason: "Maintenance",
        },
      ],
    });

    await fixture.useCase.handleTransition(darkTransition("P-1"));

    expect(fixture.store.faults).toEqual([]);
    expect(fixture.store.tickets).toEqual([]);
    expect(fixture.events).toEqual([]);
  });

  it("suppresses an isolated dead sensor before localization", async () => {
    const fixture = createFixture({
      source: "RECORDED",
      graphs: [
        graph(
          "D-1",
          "RECORDED",
          ["P-1", "P-2", "P-3"],
          [
            ["P-1", "P-2"],
            ["P-2", "P-3"],
          ],
        ),
      ],
      states: [
        state("P-1", "LIVE"),
        state("P-2", "DARK"),
        state("P-3", "LIVE"),
      ],
    });

    await fixture.useCase.handleTransition(darkTransition("P-2"));

    expect(fixture.store.faults).toEqual([]);
    expect(fixture.events).toEqual([]);
  });
});

function createFixture(options: {
  source: "RECORDED" | "FALLBACK";
  graphs: readonly NetworkGraph[];
  states: readonly PoleState[];
  outages?: readonly ScheduledOutage[];
}) {
  const states = new Map(options.states.map((state) => [state.poleId, state]));
  const snapshot = startupSnapshot(options.graphs);
  const store = new InMemoryFaultTicketStore();
  const events: LocalizationEvent[] = [];
  const graphs = new Map(
    options.graphs.map((networkGraph) => [
      networkGraph.root().dtId,
      networkGraph,
    ]),
  );
  const useCase = new LocalizeFaults({
    startupSnapshot: snapshot,
    poleStateReader: {
      getPoleState(poleId) {
        return states.get(poleId);
      },
    },
    topologyResolver: {
      resolve(dtId) {
        const resolved = graphs.get(dtId);
        if (!resolved) {
          throw new Error(`Unknown test DT ${dtId}`);
        }
        return resolved;
      },
    } satisfies TopologyResolver,
    localizationEngine: new FaultLocalizationEngine(defaultProductPolicies),
    deadSensorDetector: new DeadSensorDetector(),
    scheduledOutageFilter: new ScheduledOutageFilter(defaultProductPolicies),
    scheduledOutageProvider: {
      async listScheduledOutages() {
        return options.outages ?? [];
      },
    },
    faultTicketStore: store,
    publisher: {
      publish(event) {
        events.push(event);
      },
    },
  });

  return { useCase, store, events };
}

function startupSnapshot(graphs: readonly NetworkGraph[]): StartupSnapshot {
  const transformers = graphs.map((networkGraph) => ({
    dtId: networkGraph.root().dtId,
    feederId: "F-1",
    lat: networkGraph.root().coordinates.lat,
    lon: networkGraph.root().coordinates.lon,
  }));
  const poles = graphs.flatMap((networkGraph) =>
    networkGraph
      .descendants(networkGraph.root())
      .filter((node) => node.kind === "POLE")
      .map((node) => ({
        poleId: node.poleId,
        dtId: networkGraph.root().dtId,
        feederId: "F-1",
        pincode: "560001",
      })),
  );

  return {
    feeders: Object.freeze([]),
    distributionTransformers: Object.freeze(transformers),
    poles: Object.freeze(poles),
    poleStates: Object.freeze([]),
  } as unknown as StartupSnapshot;
}

function graph(
  dtId: string,
  source: "RECORDED" | "FALLBACK",
  poleIds: readonly string[],
  edges: readonly [string, string][],
): NetworkGraph {
  return new NetworkGraph({
    source,
    validation: { status: "VALID" },
    root: { kind: "DT", dtId, coordinates: { lat: 12.9, lon: 77.5 } },
    nodes: poleIds.map((poleId, index) => ({
      kind: "POLE" as const,
      poleId,
      coordinates: { lat: 12.9 + index / 1_000, lon: 77.5 + index / 1_000 },
    })),
    edges: edges.map(([fromPoleId, toPoleId]) => ({
      from_pole_id: fromPoleId,
      to_pole_id: toPoleId,
    })),
  });
}

function state(poleId: string, energized: PoleState["energized"]): PoleState {
  return Object.freeze({
    poleId,
    energized,
    lastHeartbeatAt: evaluationTime,
    lastEventAt: evaluationTime,
    lastBootCounter: 1,
    lastSeq: 1,
    firmwareVersion: "1.4.2",
    deviceHealth: "HEALTHY",
    hasDevice: true,
    batteryMv: null,
    rssi: null,
    updatedAt: evaluationTime,
  });
}

function darkTransition(poleId: string): PoleStateTransition {
  return Object.freeze({
    previousState: state(poleId, "LIVE"),
    currentState: state(poleId, "DARK"),
  });
}

class InMemoryFaultTicketStore {
  readonly faults: FaultPersistenceModel[] = [];
  readonly tickets: TicketPersistenceModel[] = [];

  async findActiveFault(
    identity: ActiveFaultIdentity,
  ): Promise<FaultPersistenceModel | undefined> {
    return this.faults.find((fault) => {
      if (fault.status !== "active" || fault.faultType !== identity.faultType) {
        return false;
      }
      if (identity.faultType === "span") {
        return (
          fault.dtId === identity.dtId &&
          fault.spanPoleA === identity.spanPoleA &&
          fault.spanPoleB === identity.spanPoleB
        );
      }
      if (identity.faultType === "dt") {
        return (
          fault.dtId === identity.dtId &&
          (!identity.topologySource ||
            fault.topologySource === identity.topologySource)
        );
      }
      return fault.feederId === identity.feederId;
    });
  }

  async updateActiveFault(
    faultId: string,
    update: ActiveFaultUpdate,
  ): Promise<FaultPersistenceModel | undefined> {
    const index = this.faults.findIndex(
      (fault) => fault.faultId === faultId && fault.status === "active",
    );
    if (index === -1) {
      return undefined;
    }
    const updated = {
      ...this.faults[index]!,
      ...update,
    } as FaultPersistenceModel;
    this.faults[index] = updated;
    return updated;
  }

  async createFaultAndTicket(
    fault: FaultPersistenceInput,
    ticket: TicketPersistenceInput,
  ): Promise<CreatedFaultAndTicket> {
    const createdFault = fault as FaultPersistenceModel;
    const createdTicket = ticket as TicketPersistenceModel;
    this.faults.push(createdFault);
    this.tickets.push(createdTicket);
    return { fault: createdFault, ticket: createdTicket };
  }
}

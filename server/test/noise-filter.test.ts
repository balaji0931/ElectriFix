import { describe, expect, it } from "vitest";

import { defaultProductPolicies } from "../src/config/policies.js";
import { Debouncer } from "../src/domain/noise-filter/debouncer.js";
import { DeadSensorDetector } from "../src/domain/noise-filter/dead-sensor-detector.js";
import { ScheduledOutageFilter } from "../src/domain/noise-filter/scheduled-outage-filter.js";
import type { ScheduledOutage } from "../src/domain/noise-filter/types.js";
import type { PoleState } from "../src/domain/pole-state/types.js";
import { NetworkGraph } from "../src/domain/topology/network-graph.js";

const baseTime = new Date("2026-08-05T10:00:00.000Z");

describe("Debouncer", () => {
  const debouncer = new Debouncer(defaultProductPolicies);

  it("defers after one missed heartbeat and marks presumed dark only after the threshold", () => {
    const state = poleState({
      lastHeartbeatAt: new Date("2026-08-05T09:45:00.000Z"),
    });

    expect(
      debouncer.evaluate({ poleState: state, now: baseTime }),
    ).toMatchObject({
      decision: "DEFER",
      reasonCode: "DEBOUNCE_ACTIVE",
    });
    expect(
      debouncer.evaluate({
        poleState: state,
        now: new Date("2026-08-05T10:30:01.000Z"),
      }),
    ).toMatchObject({
      decision: "MARK_PRESUMED_DARK",
      reasonCode: "PRESUMED_DARK",
    });
  });

  it("applies the same silence rule to firmware 1.2 devices", () => {
    const state = poleState({
      firmwareVersion: "1.2.0",
      lastHeartbeatAt: new Date("2026-08-05T09:29:59.000Z"),
    });

    expect(
      debouncer.evaluate({ poleState: state, now: baseTime }),
    ).toMatchObject({
      decision: "MARK_PRESUMED_DARK",
      reasonCode: "PRESUMED_DARK",
    });
  });

  it("does not mark unmonitored or already non-live poles", () => {
    expect(
      debouncer.evaluate({
        poleState: poleState({ hasDevice: false, lastHeartbeatAt: null }),
        now: baseTime,
      }),
    ).toMatchObject({ decision: "ALLOW", reasonCode: "NO_SUPPRESSION" });
    expect(
      debouncer.evaluate({
        poleState: poleState({ energized: "DARK" }),
        now: baseTime,
      }),
    ).toMatchObject({ decision: "ALLOW", reasonCode: "NO_SUPPRESSION" });
  });
});

describe("DeadSensorDetector", () => {
  const detector = new DeadSensorDetector();

  it("suppresses an isolated dark pole whose direct children are live", () => {
    const graph = graphWithChildren();
    const target = poleState({ poleId: "P-1", energized: "PRESUMED_DARK" });
    const states = new Map([
      ["P-1", target],
      ["P-2", poleState({ poleId: "P-2", energized: "LIVE" })],
      ["P-3", poleState({ poleId: "P-3", energized: "LIVE" })],
    ]);

    expect(
      detector.evaluate({
        poleState: target,
        poleStates: states,
        topology: graph,
      }),
    ).toMatchObject({ decision: "SUPPRESS", reasonCode: "DEAD_SENSOR" });
  });

  it("allows a dark pole with dark children or no topology children", () => {
    const graph = graphWithChildren();
    const target = poleState({ poleId: "P-1", energized: "DARK" });

    expect(
      detector.evaluate({
        poleState: target,
        poleStates: new Map([
          ["P-1", target],
          ["P-2", poleState({ poleId: "P-2", energized: "DARK" })],
          ["P-3", poleState({ poleId: "P-3", energized: "LIVE" })],
        ]),
        topology: graph,
      }),
    ).toMatchObject({ decision: "ALLOW", reasonCode: "NO_SUPPRESSION" });

    const leaf = poleState({ poleId: "P-2", energized: "DARK" });
    expect(
      detector.evaluate({
        poleState: leaf,
        poleStates: new Map([["P-2", leaf]]),
        topology: graph,
      }),
    ).toMatchObject({ decision: "ALLOW", reasonCode: "NO_SUPPRESSION" });
  });
});

describe("ScheduledOutageFilter", () => {
  const filter = new ScheduledOutageFilter(defaultProductPolicies);
  const outage: ScheduledOutage = {
    outageId: "SO-001",
    scope: "feeder",
    targetId: "F-01",
    scheduledStart: new Date("2026-08-05T10:00:00.000Z"),
    scheduledEnd: new Date("2026-08-05T11:00:00.000Z"),
    reason: "Maintenance",
  };

  it("suppresses matching feeder and DT outages inside the scheduled window", () => {
    expect(
      filter.evaluate({
        feederId: "F-01",
        distributionTransformerId: "D-01",
        outages: [outage],
        now: new Date("2026-08-05T10:15:00.000Z"),
      }),
    ).toMatchObject({ decision: "SUPPRESS", reasonCode: "SCHEDULED_OUTAGE" });

    expect(
      filter.evaluate({
        feederId: "F-02",
        distributionTransformerId: "D-01",
        outages: [
          { ...outage, outageId: "SO-002", scope: "dt", targetId: "D-01" },
        ],
        now: new Date("2026-08-05T10:15:00.000Z"),
      }),
    ).toMatchObject({ decision: "SUPPRESS", reasonCode: "SCHEDULED_OUTAGE" });
  });

  it("uses tolerance before and after an outage, then allows re-evaluation after expiry", () => {
    expect(
      filter.evaluate({
        feederId: "F-01",
        distributionTransformerId: "D-01",
        outages: [outage],
        now: new Date("2026-08-05T09:30:00.000Z"),
      }),
    ).toMatchObject({ decision: "SUPPRESS", reasonCode: "OUTAGE_TOLERANCE" });
    expect(
      filter.evaluate({
        feederId: "F-01",
        distributionTransformerId: "D-01",
        outages: [outage],
        now: new Date("2026-08-05T11:40:01.000Z"),
      }),
    ).toMatchObject({ decision: "ALLOW", reasonCode: "NO_SUPPRESSION" });
  });
});

function poleState(overrides: Partial<PoleState> = {}): PoleState {
  return {
    poleId: "P-1",
    energized: "LIVE",
    lastHeartbeatAt: new Date("2026-08-05T09:45:00.000Z"),
    lastEventAt: new Date("2026-08-05T09:45:00.000Z"),
    lastBootCounter: 0,
    lastSeq: 1,
    firmwareVersion: "1.4.2",
    deviceHealth: "HEALTHY",
    hasDevice: true,
    batteryMv: 3600,
    rssi: -70,
    updatedAt: new Date("2026-08-05T09:45:00.000Z"),
    ...overrides,
  };
}

function graphWithChildren(): NetworkGraph {
  return new NetworkGraph({
    source: "RECORDED",
    validation: { status: "VALID" },
    root: { kind: "DT", dtId: "D-01", coordinates: { lat: 0, lon: 0 } },
    nodes: [
      { kind: "POLE", poleId: "P-1", coordinates: { lat: 0, lon: 0 } },
      { kind: "POLE", poleId: "P-2", coordinates: { lat: 0, lon: 0 } },
      { kind: "POLE", poleId: "P-3", coordinates: { lat: 0, lon: 0 } },
    ],
    edges: [
      { from_pole_id: "P-1", to_pole_id: "P-2" },
      { from_pole_id: "P-1", to_pole_id: "P-3" },
    ],
  });
}

import { describe, expect, it } from "vitest";

import type { StartupSnapshot } from "../src/infrastructure/db/bootstrap.js";
import { FaultInjector } from "../src/simulator/fault-injector.js";
import { NetworkGenerator } from "../src/simulator/network-generator.js";
import { NoiseGenerator } from "../src/simulator/noise-generator.js";
import { TelemetryProducer } from "../src/simulator/telemetry-producer.js";
import { NetworkGraph } from "../src/domain/topology/network-graph.js";

const now = new Date("2026-08-05T12:00:00.000Z");

describe("simulator engine", () => {
  it("computes downstream span, DT, and feeder impacts from immutable topology", () => {
    const snapshot = fixtureSnapshot();
    const producer = new TelemetryProducer(snapshot);
    const injector = new FaultInjector(
      snapshot,
      { resolve: () => recordedGraph() },
      producer,
      { fraction: () => 0.5 },
    );
    const options = {
      fw12Percentage: 0,
      powerLostDeliveryRate: 1,
      clockSkewSeconds: 0,
      includeDuplicates: false,
    };

    expect(
      injector.inject({
        faultType: "span",
        targetId: "D-1",
        spanPoleA: "P-1",
        spanPoleB: "P-2",
        options,
        now,
      }).affectedPoleIds,
    ).toEqual(["P-2", "P-3"]);
    expect(
      injector.inject({ faultType: "dt", targetId: "D-1", options, now })
        .affectedPoleIds,
    ).toEqual(expect.arrayContaining(["P-1", "P-2", "P-3"]));
    expect(
      injector.inject({ faultType: "feeder", targetId: "F-1", options, now })
        .affectedPoleIds,
    ).toEqual(expect.arrayContaining(["P-1", "P-2", "P-3", "P-4"]));
  });

  it("uses the injected deterministic outcome hook for firmware silence, delivery, and clock skew", () => {
    const snapshot = fixtureSnapshot();
    const injector = new FaultInjector(
      snapshot,
      { resolve: () => recordedGraph() },
      new TelemetryProducer(snapshot),
      {
        fraction(purpose) {
          return purpose === "fw12" ? 0 : purpose === "delivery" ? 0.9 : 1;
        },
      },
    );
    const plan = injector.inject({
      faultType: "dt",
      targetId: "D-1",
      options: {
        fw12Percentage: 0.25,
        powerLostDeliveryRate: 1,
        clockSkewSeconds: 10,
        includeDuplicates: false,
      },
      now,
    });

    expect(plan.eventsDropped).toBe(3);
    expect(plan.telemetry).toHaveLength(0);
  });

  it("generates repair telemetry in a new boot generation", () => {
    const snapshot = fixtureSnapshot();
    const producer = new TelemetryProducer(snapshot);
    const [boot, restored] = producer.bootAndRestore("P-1", now);

    expect(boot.event).toMatchObject({
      event: "boot",
      boot_counter: 1,
      seq: 0,
    });
    expect(restored.event).toMatchObject({
      event: "power_restored",
      boot_counter: 1,
      seq: 1,
    });
  });

  it("selects the same default noise target and produces complete repeated scenarios", () => {
    const snapshot = fixtureSnapshot();
    const noise = new NoiseGenerator(new TelemetryProducer(snapshot), snapshot);

    const duplicate = noise.inject({
      noiseType: "duplicate_telemetry",
      targetPoleId: null,
      options: { count: 3, delaySeconds: 0 },
      now,
    });
    const stale = noise.inject({
      noiseType: "stale_retry",
      targetPoleId: null,
      options: { count: 2, delaySeconds: 7 },
      now,
    });

    expect(new NetworkGenerator(snapshot).defaultDevicePoleId()).toBe("P-1");
    expect(duplicate.targetPoleId).toBe("P-1");
    expect(duplicate.telemetry).toHaveLength(6);
    expect(duplicate.telemetry.map((event) => event.expectedAdmission)).toEqual(
      [
        "accepted",
        "duplicate",
        "accepted",
        "duplicate",
        "accepted",
        "duplicate",
      ],
    );
    expect(stale.telemetry).toHaveLength(4);
    expect(stale.telemetry[1]).toMatchObject({
      expectedAdmission: "stale",
      delayMs: 7_000,
    });
  });
});

function fixtureSnapshot(): StartupSnapshot {
  return {
    feeders: [{ feederId: "F-1" }],
    distributionTransformers: [
      { dtId: "D-1", feederId: "F-1", hasRecordedTopology: true },
      { dtId: "D-2", feederId: "F-1", hasRecordedTopology: false },
    ],
    poles: [
      { poleId: "P-3", deviceId: "DEV-3", dtId: "D-1", feederId: "F-1" },
      { poleId: "P-1", deviceId: "DEV-1", dtId: "D-1", feederId: "F-1" },
      { poleId: "P-2", deviceId: "DEV-2", dtId: "D-1", feederId: "F-1" },
      { poleId: "P-4", deviceId: "DEV-4", dtId: "D-2", feederId: "F-1" },
    ],
    poleStates: [
      { poleId: "P-1", lastBootCounter: null, lastSeq: null },
      { poleId: "P-2", lastBootCounter: null, lastSeq: null },
      { poleId: "P-3", lastBootCounter: null, lastSeq: null },
      { poleId: "P-4", lastBootCounter: null, lastSeq: null },
    ],
  } as unknown as StartupSnapshot;
}

function recordedGraph(): NetworkGraph {
  return new NetworkGraph({
    source: "RECORDED",
    validation: { status: "VALID" },
    root: { kind: "DT", dtId: "D-1", coordinates: { lat: 0, lon: 0 } },
    nodes: ["P-1", "P-2", "P-3"].map((poleId) => ({
      kind: "POLE" as const,
      poleId,
      coordinates: { lat: 0, lon: 0 },
    })),
    edges: [
      { from_pole_id: "P-1", to_pole_id: "P-2" },
      { from_pole_id: "P-2", to_pole_id: "P-3" },
    ],
  });
}

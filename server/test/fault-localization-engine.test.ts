import { describe, expect, it } from "vitest";

import { defaultProductPolicies } from "../src/config/policies.js";
import { FaultLocalizationEngine } from "../src/domain/localization/fault-localization-engine.js";
import type {
  DTLocalizationInput,
  FeederLocalizationInput,
} from "../src/domain/localization/types.js";
import type { PoleState } from "../src/domain/pole-state/types.js";
import { NetworkGraph } from "../src/domain/topology/network-graph.js";
import type { TopologySource } from "../src/domain/contracts.js";

const evaluationTime = new Date("2026-08-05T12:00:00.000Z");
const engine = new FaultLocalizationEngine(defaultProductPolicies);

describe("FaultLocalizationEngine", () => {
  it("localizes a recorded span and includes downstream unknown poles", () => {
    const input = dtInput({
      states: [
        state("P-1", "LIVE", { heartbeatMinutesAgo: 5 }),
        state("P-2", "DARK"),
        state("P-3", "DARK"),
        state("P-4", "UNKNOWN", { hasDevice: false }),
        state("P-5", "DARK"),
        state("P-6", "DARK"),
      ],
      edges: [
        ["P-1", "P-2"],
        ["P-2", "P-3"],
        ["P-3", "P-4"],
        ["P-4", "P-5"],
        ["P-5", "P-6"],
      ],
    });

    const [candidate] = engine.localizeDT(input);

    expect(candidate).toMatchObject({
      fault_type: "span",
      span_pole_a: "P-1",
      span_pole_b: "P-2",
      affected_pole_count: 5,
      confidence_level: "HIGH",
      topology_source: "RECORDED",
    });
    expect(candidate?.evidence.affected_poles).toEqual([
      "P-2",
      "P-3",
      "P-4",
      "P-5",
      "P-6",
    ]);
    expect(candidate?.evidence.pincode).toBe("560001");
  });

  it("widens a boundary across unmonitored poles and downgrades confidence", () => {
    const [candidate] = engine.localizeDT(
      dtInput({
        states: [
          state("P-1", "LIVE", { heartbeatMinutesAgo: 5 }),
          state("P-2", "UNKNOWN", { hasDevice: false }),
          state("P-3", "DARK"),
        ],
        edges: [
          ["P-1", "P-2"],
          ["P-2", "P-3"],
        ],
      }),
    );

    expect(candidate).toMatchObject({
      span_pole_a: "P-1",
      span_pole_b: "P-3",
      confidence_level: "MEDIUM",
    });
    expect(candidate?.evidence.confidence_reasons).toContainEqual(
      expect.objectContaining({
        factor: "Unmonitored boundary",
        positive: false,
      }),
    );
  });

  it("returns DT-level LOW confidence for fallback topology without span precision", () => {
    const [candidate] = engine.localizeDT(
      dtInput({
        source: "FALLBACK",
        states: [state("P-1", "DARK"), state("P-2", "DARK")],
        edges: [],
      }),
    );

    expect(candidate).toMatchObject({
      fault_type: "dt",
      span_pole_a: null,
      span_pole_b: null,
      confidence_level: "LOW",
      topology_source: "FALLBACK",
      affected_pole_count: 2,
    });
  });

  it("classifies a fully dark recorded DT with unknown poles as a DT fault", () => {
    const [candidate] = engine.localizeDT(
      dtInput({
        states: [
          state("P-1", "DARK"),
          state("P-2", "DARK"),
          state("P-3", "UNKNOWN", { hasDevice: false }),
        ],
        edges: [
          ["P-1", "P-2"],
          ["P-2", "P-3"],
        ],
      }),
    );

    expect(candidate).toMatchObject({
      fault_type: "dt",
      affected_pole_count: 3,
      confidence_level: "HIGH",
    });
  });

  it("separates multiple recorded boundaries under one DT", () => {
    const candidates = engine.localizeDT(
      dtInput({
        states: [
          state("P-1", "LIVE", { heartbeatMinutesAgo: 2 }),
          state("P-2", "DARK"),
          state("P-3", "DARK"),
          state("P-4", "LIVE", { heartbeatMinutesAgo: 2 }),
          state("P-5", "DARK"),
          state("P-6", "DARK"),
        ],
        edges: [
          ["P-1", "P-2"],
          ["P-2", "P-3"],
          ["P-1", "P-4"],
          ["P-4", "P-5"],
          ["P-5", "P-6"],
        ],
      }),
    );

    expect(
      candidates.map((candidate) => candidate.evidence.fault_span),
    ).toEqual([
      ["P-1", "P-2"],
      ["P-4", "P-5"],
    ]);
  });

  it("excludes dead sensors supplied through suppression context", () => {
    const candidates = engine.localizeDT(
      dtInput({
        states: [
          state("P-1", "LIVE", { heartbeatMinutesAgo: 2 }),
          state("P-2", "DARK"),
        ],
        edges: [["P-1", "P-2"]],
        suppressedPoleIds: ["P-2"],
      }),
    );

    expect(candidates).toEqual([]);
  });

  it("downgrades all presumed-dark evidence to LOW", () => {
    const [candidate] = engine.localizeDT(
      dtInput({
        states: [
          state("P-1", "LIVE", { heartbeatMinutesAgo: 2 }),
          state("P-2", "PRESUMED_DARK"),
          state("P-3", "PRESUMED_DARK"),
        ],
        edges: [
          ["P-1", "P-2"],
          ["P-2", "P-3"],
        ],
      }),
    );

    expect(candidate?.confidence_level).toBe("LOW");
    expect(candidate?.evidence.confidence_reasons).toContainEqual(
      expect.objectContaining({ factor: "Dark status", positive: false }),
    );
  });

  it("applies inferred, stale-heartbeat, and sensor-gap confidence downgrades deterministically", () => {
    const [inferred] = engine.localizeDT(
      dtInput({
        source: "INFERRED",
        states: [
          state("P-1", "LIVE", { heartbeatMinutesAgo: 2 }),
          state("P-2", "DARK"),
          state("P-3", "DARK"),
        ],
        edges: [
          ["P-1", "P-2"],
          ["P-2", "P-3"],
        ],
      }),
    );
    const [stale] = engine.localizeDT(
      dtInput({
        states: [
          state("P-1", "LIVE", { heartbeatMinutesAgo: 21 }),
          state("P-2", "DARK"),
          state("P-3", "DARK"),
        ],
        edges: [
          ["P-1", "P-2"],
          ["P-2", "P-3"],
        ],
      }),
    );
    const [gap] = engine.localizeDT(
      dtInput({
        states: [
          state("P-1", "LIVE", { heartbeatMinutesAgo: 2 }),
          state("P-2", "DARK"),
          state("P-3", "UNKNOWN", { hasDevice: false }),
          state("P-4", "UNKNOWN", { hasDevice: false }),
        ],
        edges: [
          ["P-1", "P-2"],
          ["P-2", "P-3"],
          ["P-3", "P-4"],
        ],
      }),
    );

    expect(inferred?.confidence_level).toBe("MEDIUM");
    expect(stale?.confidence_level).toBe("MEDIUM");
    expect(gap?.confidence_level).toBe("LOW");
  });

  it("returns one feeder candidate when the configured DT threshold is met", () => {
    const feederInput: FeederLocalizationInput = {
      feederId: "F-1",
      dtInputs: [
        dtInput({
          dtId: "DT-1",
          feederId: "F-1",
          states: [state("P-1", "DARK"), state("P-2", "DARK")],
          edges: [["P-1", "P-2"]],
        }),
        dtInput({
          dtId: "DT-2",
          feederId: "F-1",
          states: [state("P-3", "DARK"), state("P-4", "DARK")],
          edges: [["P-3", "P-4"]],
        }),
      ],
    };

    const [candidate] = engine.localizeFeeder(feederInput);

    expect(candidate).toMatchObject({
      fault_type: "feeder",
      feeder_id: "F-1",
      affected_pole_count: 4,
      confidence_level: "HIGH",
    });
  });

  it("is deterministic and deeply immutable for identical inputs", () => {
    const input = dtInput({
      states: [
        state("P-1", "LIVE", { heartbeatMinutesAgo: 2 }),
        state("P-2", "DARK"),
        state("P-3", "DARK"),
      ],
      edges: [
        ["P-1", "P-2"],
        ["P-2", "P-3"],
      ],
    });
    const first = engine.localizeDT(input);
    const second = engine.localizeDT(input);
    const candidate = first[0]!;

    expect(first).toEqual(second);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(candidate)).toBe(true);
    expect(Object.isFrozen(candidate.evidence)).toBe(true);
    expect(Object.isFrozen(candidate.evidence.affected_poles)).toBe(true);
    expect(Object.isFrozen(candidate.evidence.coordinates)).toBe(true);
  });
});

function dtInput(options: {
  states: readonly PoleState[];
  edges: readonly [string, string][];
  source?: TopologySource;
  dtId?: string;
  feederId?: string;
  suppressedPoleIds?: readonly string[];
}): DTLocalizationInput {
  const dtId = options.dtId ?? "DT-1";
  return {
    feederId: options.feederId ?? "F-1",
    topology: new NetworkGraph({
      source: options.source ?? "RECORDED",
      validation: { status: "VALID" },
      root: { kind: "DT", dtId, coordinates: { lat: 12.9, lon: 77.5 } },
      nodes: options.states.map((pole, index) => ({
        kind: "POLE",
        poleId: pole.poleId,
        coordinates: { lat: 12.9 + index / 1_000, lon: 77.5 + index / 1_000 },
      })),
      edges: options.edges.map(([from, to]) => ({
        from_pole_id: from,
        to_pole_id: to,
      })),
    }),
    poleStates: options.states,
    poleMetadata: Object.fromEntries(
      options.states.map((pole) => [pole.poleId, { pincode: "560001" }]),
    ),
    suppressionContext: {
      suppressedPoleIds: options.suppressedPoleIds ?? [],
      suppressionReasons: Object.fromEntries(
        (options.suppressedPoleIds ?? []).map((poleId) => [
          poleId,
          "DEAD_SENSOR",
        ]),
      ),
    },
    evaluationTime,
  };
}

function state(
  poleId: string,
  energized: PoleState["energized"],
  options: { hasDevice?: boolean; heartbeatMinutesAgo?: number } = {},
): PoleState {
  return {
    poleId,
    energized,
    lastHeartbeatAt:
      options.heartbeatMinutesAgo === undefined
        ? null
        : new Date(
            evaluationTime.getTime() - options.heartbeatMinutesAgo * 60_000,
          ),
    lastEventAt: null,
    lastBootCounter: null,
    lastSeq: null,
    firmwareVersion: null,
    deviceHealth: options.hasDevice === false ? "NO_DEVICE" : "HEALTHY",
    hasDevice: options.hasDevice ?? true,
    batteryMv: null,
    rssi: null,
    updatedAt: evaluationTime,
  };
}

import { describe, expect, it } from "vitest";

import { FallbackTopologyResolver } from "../src/domain/topology/fallback-topology-resolver.js";
import { RecordedTopologyResolver } from "../src/domain/topology/recorded-topology-resolver.js";
import { CachedTopologyResolver } from "../src/domain/topology/topology-resolver.js";
import { TopologyValidationError } from "../src/domain/topology/types.js";
import type { StartupSnapshot } from "../src/infrastructure/db/bootstrap.js";

function startupSnapshot(
  poles: Array<{
    poleId: string;
    dtId: string;
    seqOnLine: number | null;
    parentPoleId: string | null;
  }>,
): StartupSnapshot {
  return Object.freeze({
    feeders: Object.freeze([
      {
        feederId: "F-07-01",
        substationId: "SS-07",
        name: "Feeder",
        createdAt: new Date("2026-08-05T00:00:00.000Z"),
      },
    ]),
    distributionTransformers: Object.freeze([
      {
        dtId: "D-REC",
        feederId: "F-07-01",
        lat: 12.9,
        lon: 77.5,
        capacityKva: 100,
        householdsServed: 100,
        hasRecordedTopology: true,
        createdAt: new Date("2026-08-05T00:00:00.000Z"),
      },
      {
        dtId: "D-FALLBACK",
        feederId: "F-07-01",
        lat: 12.91,
        lon: 77.51,
        capacityKva: 100,
        householdsServed: 100,
        hasRecordedTopology: false,
        createdAt: new Date("2026-08-05T00:00:00.000Z"),
      },
    ]),
    poles: Object.freeze(
      poles.map((pole, index) => ({
        ...pole,
        lat: 12.9 + index * 0.001,
        lon: 77.5 + index * 0.001,
        feederId: "F-07-01",
        poleType: null,
        ward: null,
        pincode: null,
        deviceId: null,
        createdAt: new Date("2026-08-05T00:00:00.000Z"),
      })),
    ),
    poleStates: Object.freeze([]),
  });
}

const validSnapshot = startupSnapshot([
  { poleId: "P-001", dtId: "D-REC", seqOnLine: 1, parentPoleId: null },
  { poleId: "P-002", dtId: "D-REC", seqOnLine: 2, parentPoleId: "P-001" },
  { poleId: "P-003", dtId: "D-REC", seqOnLine: 2, parentPoleId: "P-001" },
  { poleId: "P-101", dtId: "D-FALLBACK", seqOnLine: null, parentPoleId: null },
  { poleId: "P-102", dtId: "D-FALLBACK", seqOnLine: null, parentPoleId: null },
]);

describe("topology resolvers", () => {
  it("constructs and validates a recorded tree from parent_pole_id and seq_on_line", () => {
    const graph = new RecordedTopologyResolver(validSnapshot).resolve("D-REC");

    expect(graph.source).toBe("RECORDED");
    expect(graph.validation).toEqual({ status: "VALID" });
    expect(graph.children(graph.root())).toEqual([
      expect.objectContaining({ poleId: "P-001" }),
    ]);
  });

  it("fails invalid recorded topology instead of silently falling back", () => {
    const invalidSnapshot = startupSnapshot([
      { poleId: "P-001", dtId: "D-REC", seqOnLine: 1, parentPoleId: null },
      { poleId: "P-002", dtId: "D-REC", seqOnLine: 1, parentPoleId: null },
    ]);

    expect(() =>
      new RecordedTopologyResolver(invalidSnapshot).resolve("D-REC"),
    ).toThrow(TopologyValidationError);
  });

  it("rejects disconnected or cyclic recorded topology", () => {
    const invalidSnapshot = startupSnapshot([
      { poleId: "P-001", dtId: "D-REC", seqOnLine: 1, parentPoleId: null },
      { poleId: "P-002", dtId: "D-REC", seqOnLine: 2, parentPoleId: "P-003" },
      { poleId: "P-003", dtId: "D-REC", seqOnLine: 3, parentPoleId: "P-002" },
    ]);

    expect(() =>
      new RecordedTopologyResolver(invalidSnapshot).resolve("D-REC"),
    ).toThrow(TopologyValidationError);
  });

  it("returns flat fallback topology without pole-to-pole edges", () => {
    const graph = new FallbackTopologyResolver(validSnapshot).resolve(
      "D-FALLBACK",
    );

    expect(graph.source).toBe("FALLBACK");
    expect(graph.children(graph.root())).toHaveLength(2);
    expect(graph.children(graph.children(graph.root())[0]!)).toEqual([]);
    expect(graph.parent(graph.children(graph.root())[0]!)).toEqual(
      graph.root(),
    );
  });

  it("caches the immutable graph chosen from the static startup snapshot", () => {
    const resolver = new CachedTopologyResolver(validSnapshot);

    expect(resolver.resolve("D-REC")).toBe(resolver.resolve("D-REC"));
    expect(resolver.resolve("D-FALLBACK").source).toBe("FALLBACK");
  });
});

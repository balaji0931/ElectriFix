import { describe, expect, it } from "vitest";

import {
  fallbackTopologyFixture,
  inferredTopologyFixture,
  recordedTopologyFixture,
} from "./fixtures/topology.fixtures.js";

describe("topology fixtures", () => {
  it("provides a recorded topology with a root, nodes, and edges", () => {
    expect(recordedTopologyFixture.source).toBe("RECORDED");
    expect(recordedTopologyFixture.root.dt_id).toBeTruthy();
    expect(recordedTopologyFixture.nodes.length).toBeGreaterThan(0);
    expect(recordedTopologyFixture.edges.length).toBeGreaterThan(0);
  });

  it("provides an inferred topology with the same minimal transport shape", () => {
    expect(inferredTopologyFixture.source).toBe("INFERRED");
    expect(inferredTopologyFixture.nodes.length).toBeGreaterThan(0);
    expect(inferredTopologyFixture.edges.length).toBeGreaterThan(0);
  });

  it("provides a fallback topology without assuming a recorded edge graph", () => {
    expect(fallbackTopologyFixture.source).toBe("FALLBACK");
    expect(fallbackTopologyFixture.nodes.length).toBeGreaterThan(0);
    expect(fallbackTopologyFixture.edges).toEqual([]);
  });
});

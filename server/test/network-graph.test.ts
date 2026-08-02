import { describe, expect, it } from "vitest";

import { NetworkGraph } from "../src/domain/topology/network-graph.js";

const graph = new NetworkGraph({
  source: "RECORDED",
  validation: { status: "VALID" },
  root: {
    kind: "DT",
    dtId: "D-0001",
    coordinates: { lat: 12.9, lon: 77.5 },
  },
  nodes: [
    {
      kind: "POLE",
      poleId: "P-001",
      coordinates: { lat: 12.901, lon: 77.501 },
    },
    {
      kind: "POLE",
      poleId: "P-002",
      coordinates: { lat: 12.902, lon: 77.502 },
    },
    {
      kind: "POLE",
      poleId: "P-003",
      coordinates: { lat: 12.903, lon: 77.503 },
    },
  ],
  edges: [
    { from_pole_id: "P-001", to_pole_id: "P-002" },
    { from_pole_id: "P-001", to_pole_id: "P-003" },
  ],
});

describe("NetworkGraph", () => {
  it("traverses recorded topology from a discriminated DT root", () => {
    const root = graph.root();
    const [firstPole] = graph.children(root);

    expect(root.kind).toBe("DT");
    expect(firstPole).toMatchObject({ kind: "POLE", poleId: "P-001" });
    expect(graph.children(firstPole!)).toEqual([
      expect.objectContaining({ poleId: "P-002" }),
      expect.objectContaining({ poleId: "P-003" }),
    ]);
    expect(graph.parent(firstPole!)).toEqual(root);
  });

  it("returns ancestors, descendants, and subtree without localization behavior", () => {
    const root = graph.root();
    const firstPole = graph.children(root)[0]!;
    const secondPole = graph.children(firstPole)[0]!;

    expect(graph.ancestors(secondPole)).toEqual([firstPole, root]);
    expect(graph.descendants(root)).toEqual([
      firstPole,
      expect.objectContaining({ poleId: "P-002" }),
      expect.objectContaining({ poleId: "P-003" }),
    ]);
    expect(graph.subtree(firstPole)).toEqual([
      firstPole,
      expect.objectContaining({ poleId: "P-002" }),
      expect.objectContaining({ poleId: "P-003" }),
    ]);
  });

  it("is immutable after construction", () => {
    expect(Object.isFrozen(graph)).toBe(true);
    expect(Object.isFrozen(graph.root())).toBe(true);
    expect(Object.isFrozen(graph.children(graph.root()))).toBe(true);
  });

  it("rejects pole-to-pole edges in fallback topology", () => {
    expect(
      () =>
        new NetworkGraph({
          source: "FALLBACK",
          validation: { status: "VALID" },
          root: graph.root(),
          nodes: [
            {
              kind: "POLE",
              poleId: "P-001",
              coordinates: { lat: 12.901, lon: 77.501 },
            },
            {
              kind: "POLE",
              poleId: "P-002",
              coordinates: { lat: 12.902, lon: 77.502 },
            },
          ],
          edges: [{ from_pole_id: "P-001", to_pole_id: "P-002" }],
        }),
    ).toThrow("Fallback topology cannot contain pole-to-pole edges");
  });
});

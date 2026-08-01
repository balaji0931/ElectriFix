import type { Topology } from "../../src/domain/contracts.js";

export const recordedTopologyFixture: Topology = {
  source: "RECORDED",
  root: {
    dt_id: "DT-REC-001",
    coordinates: { lat: 12.9716, lon: 77.5946 },
  },
  nodes: [
    { pole_id: "P-REC-001", coordinates: { lat: 12.9718, lon: 77.5948 } },
    { pole_id: "P-REC-002", coordinates: { lat: 12.972, lon: 77.595 } },
    { pole_id: "P-REC-003", coordinates: { lat: 12.9722, lon: 77.5952 } },
  ],
  edges: [
    { from_pole_id: "P-REC-001", to_pole_id: "P-REC-002" },
    { from_pole_id: "P-REC-002", to_pole_id: "P-REC-003" },
  ],
};

export const inferredTopologyFixture: Topology = {
  source: "INFERRED",
  root: {
    dt_id: "DT-INF-001",
    coordinates: { lat: 12.974, lon: 77.597 },
  },
  nodes: [
    { pole_id: "P-INF-001", coordinates: { lat: 12.9742, lon: 77.5972 } },
    { pole_id: "P-INF-002", coordinates: { lat: 12.9744, lon: 77.5974 } },
    { pole_id: "P-INF-003", coordinates: { lat: 12.9746, lon: 77.5976 } },
  ],
  edges: [
    { from_pole_id: "P-INF-001", to_pole_id: "P-INF-002" },
    { from_pole_id: "P-INF-002", to_pole_id: "P-INF-003" },
  ],
};

export const fallbackTopologyFixture: Topology = {
  source: "FALLBACK",
  root: {
    dt_id: "DT-FALLBACK-001",
    coordinates: { lat: 12.976, lon: 77.6 },
  },
  nodes: [
    { pole_id: "P-FALLBACK-001", coordinates: { lat: 12.9762, lon: 77.6002 } },
    { pole_id: "P-FALLBACK-002", coordinates: { lat: 12.9764, lon: 77.6004 } },
  ],
  edges: [],
};

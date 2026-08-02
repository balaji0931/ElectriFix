import type { StartupSnapshot } from "../../infrastructure/db/bootstrap.js";
import { NetworkGraph } from "./network-graph.js";
import { TopologyValidationError, type PoleNodeRef } from "./types.js";

export class FallbackTopologyResolver {
  constructor(private readonly startupSnapshot: StartupSnapshot) {}

  resolve(dtId: string): NetworkGraph {
    const transformer = this.startupSnapshot.distributionTransformers.find(
      (candidate) => candidate.dtId === dtId,
    );
    if (!transformer) {
      throw new TopologyValidationError(
        `Unknown distribution transformer: ${dtId}`,
      );
    }

    const dtPoles = this.startupSnapshot.poles.filter(
      (pole) => pole.dtId === dtId,
    );
    if (dtPoles.length === 0) {
      throw new TopologyValidationError(
        `Fallback topology for ${dtId} has no poles`,
      );
    }

    return new NetworkGraph({
      source: "FALLBACK",
      validation: { status: "VALID" },
      root: {
        kind: "DT",
        dtId: transformer.dtId,
        coordinates: { lat: transformer.lat, lon: transformer.lon },
      },
      nodes: dtPoles.map<PoleNodeRef>((pole) => ({
        kind: "POLE",
        poleId: pole.poleId,
        coordinates: { lat: pole.lat, lon: pole.lon },
      })),
      edges: [],
    });
  }
}

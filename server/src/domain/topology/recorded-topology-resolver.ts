import type { StartupSnapshot } from "../../infrastructure/db/bootstrap.js";
import { NetworkGraph } from "./network-graph.js";
import { TopologyValidationError, type PoleNodeRef } from "./types.js";

export class RecordedTopologyResolver {
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
    if (!transformer.hasRecordedTopology) {
      throw new TopologyValidationError(
        `Distribution transformer ${dtId} has no recorded topology`,
      );
    }

    const dtPoles = this.startupSnapshot.poles.filter(
      (pole) => pole.dtId === dtId,
    );
    if (dtPoles.length === 0) {
      throw new TopologyValidationError(
        `Recorded topology for ${dtId} has no poles`,
      );
    }

    validateRecordedTopology(dtPoles);

    return new NetworkGraph({
      source: "RECORDED",
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
      edges: dtPoles.flatMap((pole) =>
        pole.parentPoleId === null
          ? []
          : [{ from_pole_id: pole.parentPoleId, to_pole_id: pole.poleId }],
      ),
    });
  }
}

function validateRecordedTopology(
  poles: readonly StartupSnapshot["poles"][number][],
): void {
  const polesById = new Map(poles.map((pole) => [pole.poleId, pole]));
  const rootPoles = poles.filter((pole) => pole.parentPoleId === null);

  if (rootPoles.length !== 1) {
    throw new TopologyValidationError(
      "Recorded topology must have exactly one root pole",
    );
  }

  for (const pole of poles) {
    if (pole.seqOnLine === null) {
      throw new TopologyValidationError(
        `Recorded pole ${pole.poleId} is missing seq_on_line`,
      );
    }
    if (pole.parentPoleId === null) {
      continue;
    }

    const parent = polesById.get(pole.parentPoleId);
    if (!parent) {
      throw new TopologyValidationError(
        `Recorded pole ${pole.poleId} references an unknown parent`,
      );
    }
    if (parent.seqOnLine === null || parent.seqOnLine >= pole.seqOnLine) {
      throw new TopologyValidationError(
        `Recorded pole ${pole.poleId} has an invalid parent ordering`,
      );
    }
  }

  const visited = new Set<string>();
  const pending = [rootPoles[0]!.poleId];

  while (pending.length > 0) {
    const poleId = pending.pop();
    if (!poleId || visited.has(poleId)) {
      continue;
    }

    visited.add(poleId);
    for (const pole of poles) {
      if (pole.parentPoleId === poleId) {
        pending.push(pole.poleId);
      }
    }
  }

  if (visited.size !== poles.length) {
    throw new TopologyValidationError(
      "Recorded topology must be connected and acyclic",
    );
  }
}

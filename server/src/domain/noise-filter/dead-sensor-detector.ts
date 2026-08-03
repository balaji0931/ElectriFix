import { NetworkGraph } from "../topology/network-graph.js";
import type { PoleState } from "../pole-state/types.js";
import { noiseFilterResult, type NoiseFilterResult } from "./types.js";

export interface DeadSensorInput {
  readonly poleState: PoleState;
  readonly poleStates: ReadonlyMap<string, PoleState>;
  readonly topology: NetworkGraph;
}

/** Identifies the documented impossible radial state: dark parent, live children. */
export class DeadSensorDetector {
  evaluate(input: DeadSensorInput): NoiseFilterResult {
    const { poleState, poleStates, topology } = input;
    if (
      poleState.energized !== "DARK" &&
      poleState.energized !== "PRESUMED_DARK"
    ) {
      return noiseFilterResult("ALLOW", "NO_SUPPRESSION", {
        pole_id: poleState.poleId,
      });
    }

    const children = topology.children({
      kind: "POLE",
      poleId: poleState.poleId,
      coordinates: { lat: 0, lon: 0 },
    });
    const childPoleIds = children
      .filter((child) => child.kind === "POLE")
      .map((child) => child.poleId);

    if (childPoleIds.length === 0) {
      return noiseFilterResult("ALLOW", "NO_SUPPRESSION", {
        pole_id: poleState.poleId,
      });
    }

    const allChildrenLive = childPoleIds.every(
      (poleId) => poleStates.get(poleId)?.energized === "LIVE",
    );
    if (!allChildrenLive) {
      return noiseFilterResult("ALLOW", "NO_SUPPRESSION", {
        pole_id: poleState.poleId,
      });
    }

    return noiseFilterResult("SUPPRESS", "DEAD_SENSOR", {
      pole_id: poleState.poleId,
      live_child_pole_ids: childPoleIds,
    });
  }
}

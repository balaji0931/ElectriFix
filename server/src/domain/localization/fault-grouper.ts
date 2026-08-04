import type { PoleState } from "../pole-state/types.js";
import type { GraphNodeRef } from "../topology/types.js";
import { NetworkGraph } from "../topology/network-graph.js";
import { indexPoleNodes, isDark } from "./boundary-finder.js";
import type { Boundary, FaultGroup } from "./types.js";

export class FaultGrouper {
  group(
    boundaries: readonly Boundary[],
    topology: NetworkGraph,
    statesByPoleId: ReadonlyMap<string, PoleState>,
    suppressedPoleIds: ReadonlySet<string>,
  ): readonly FaultGroup[] {
    const grouped = new Map<string, Boundary>();
    const nodesById = indexPoleNodes(topology);
    for (const boundary of boundaries) {
      const key = boundaryKey(boundary);
      if (!grouped.has(key)) {
        grouped.set(key, boundary);
      }
    }

    return Object.freeze(
      [...grouped.values()]
        .sort((left, right) =>
          boundaryKey(left).localeCompare(boundaryKey(right)),
        )
        .map((boundary) =>
          this.createGroup(
            boundary,
            topology,
            statesByPoleId,
            suppressedPoleIds,
            nodesById,
          ),
        ),
    );
  }

  private createGroup(
    boundary: Boundary,
    topology: NetworkGraph,
    statesByPoleId: ReadonlyMap<string, PoleState>,
    suppressedPoleIds: ReadonlySet<string>,
    nodesById: ReadonlyMap<string, GraphNodeRef>,
  ): FaultGroup {
    const firstDarkNode = nodesById.get(boundary.firstDarkPoleId);
    if (!firstDarkNode || firstDarkNode.kind !== "POLE") {
      throw new Error(`Unknown boundary pole: ${boundary.firstDarkPoleId}`);
    }

    const affectedPoleIds = topology
      .subtree(firstDarkNode)
      .filter((node) => node.kind === "POLE")
      .map((node) => node.poleId)
      .sort();
    const downstreamDarkPoleIds = affectedPoleIds.filter((poleId) => {
      const state = statesByPoleId.get(poleId);
      return Boolean(state && !suppressedPoleIds.has(poleId) && isDark(state));
    });
    const contradictory = affectedPoleIds.some(
      (poleId) => statesByPoleId.get(poleId)?.energized === "LIVE",
    );

    return Object.freeze({
      boundary,
      affectedPoleIds: Object.freeze(affectedPoleIds),
      downstreamDarkPoleIds: Object.freeze(downstreamDarkPoleIds),
      contradictory,
    });
  }
}

function boundaryKey(boundary: Boundary): string {
  return `${boundary.lastLivePoleId}\u0000${boundary.firstDarkPoleId}`;
}

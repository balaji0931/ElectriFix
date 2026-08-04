import type { PoleState } from "../pole-state/types.js";
import type { GraphNodeRef } from "../topology/types.js";
import { NetworkGraph } from "../topology/network-graph.js";
import type { Boundary } from "./types.js";

export class BoundaryFinder {
  find(
    topology: NetworkGraph,
    statesByPoleId: ReadonlyMap<string, PoleState>,
    suppressedPoleIds: ReadonlySet<string>,
  ): readonly Boundary[] {
    const boundaries: Boundary[] = [];
    const nodesById = indexPoleNodes(topology);

    for (const poleId of [...nodesById.keys()].sort()) {
      const state = statesByPoleId.get(poleId);
      if (!state || suppressedPoleIds.has(poleId) || !isDark(state)) {
        continue;
      }

      const boundary = this.findBoundary(
        topology,
        poleId,
        statesByPoleId,
        suppressedPoleIds,
        nodesById,
      );
      if (boundary) {
        boundaries.push(boundary);
      }
    }

    return Object.freeze(boundaries);
  }

  private findBoundary(
    topology: NetworkGraph,
    firstDarkPoleId: string,
    statesByPoleId: ReadonlyMap<string, PoleState>,
    suppressedPoleIds: ReadonlySet<string>,
    nodesById: ReadonlyMap<string, GraphNodeRef>,
  ): Boundary | undefined {
    let current: GraphNodeRef | null = topology.parent(
      poleNode(nodesById, firstDarkPoleId),
    );
    let boundaryDarkPoleId = firstDarkPoleId;
    const unmonitoredPoleIds: string[] = [];

    while (current?.kind === "POLE") {
      const state = statesByPoleId.get(current.poleId);
      if (suppressedPoleIds.has(current.poleId)) {
        current = topology.parent(current);
        continue;
      }
      if (state?.energized === "LIVE") {
        return Object.freeze({
          lastLivePoleId: current.poleId,
          firstDarkPoleId: boundaryDarkPoleId,
          unmonitoredPoleIds: Object.freeze([...unmonitoredPoleIds]),
        });
      }
      if (state && isDark(state)) {
        boundaryDarkPoleId = current.poleId;
      }
      if (!state?.hasDevice) {
        unmonitoredPoleIds.push(current.poleId);
      }
      current = topology.parent(current);
    }

    return undefined;
  }
}

export function isDark(state: PoleState): boolean {
  return state.energized === "DARK" || state.energized === "PRESUMED_DARK";
}

export function poleIds(topology: NetworkGraph): readonly string[] {
  return Object.freeze([...indexPoleNodes(topology).keys()].sort());
}

export function indexPoleNodes(
  topology: NetworkGraph,
): ReadonlyMap<string, GraphNodeRef> {
  return new Map(
    topology
      .descendants(topology.root())
      .filter((node) => node.kind === "POLE")
      .map((node) => [node.poleId, node]),
  );
}

function poleNode(
  nodesById: ReadonlyMap<string, GraphNodeRef>,
  poleId: string,
) {
  const node = nodesById.get(poleId);
  if (!node || node.kind !== "POLE") {
    throw new Error(`Unknown pole node: ${poleId}`);
  }
  return node;
}

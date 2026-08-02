import type { TopologyEdge, TopologySource } from "../contracts.js";
import type {
  DistributionTransformerNodeRef,
  GraphNodeRef,
  NetworkGraphInput,
  PoleNodeRef,
  TopologyValidationResult,
} from "./types.js";

export class NetworkGraph {
  readonly source: TopologySource;
  readonly validation: TopologyValidationResult;

  private readonly rootNode: DistributionTransformerNodeRef;
  private readonly poleNodesById: ReadonlyMap<string, PoleNodeRef>;
  private readonly parentPoleIds: ReadonlyMap<string, string | null>;
  private readonly childPoleIds: ReadonlyMap<string, readonly string[]>;

  constructor(input: NetworkGraphInput) {
    if (input.source === "FALLBACK" && input.edges.length > 0) {
      throw new Error("Fallback topology cannot contain pole-to-pole edges");
    }

    this.source = input.source;
    this.validation = Object.freeze({ ...input.validation });
    this.rootNode = freezeDistributionTransformerNode(input.root);
    this.poleNodesById = buildPoleNodeIndex(input.nodes);
    this.parentPoleIds = buildParentIndex(input.edges, this.poleNodesById);
    this.childPoleIds = buildChildIndex(
      this.parentPoleIds,
      this.poleNodesById,
      this.source,
    );

    Object.freeze(this);
  }

  root(): DistributionTransformerNodeRef {
    return this.rootNode;
  }

  children(node: GraphNodeRef): readonly GraphNodeRef[] {
    if (node.kind === "DT") {
      this.assertRoot(node);
      return Object.freeze(
        this.childIdsForRoot().map((poleId) => this.poleNode(poleId)),
      );
    }

    return Object.freeze(
      (this.childPoleIds.get(this.assertPole(node)) ?? []).map((poleId) =>
        this.poleNode(poleId),
      ),
    );
  }

  parent(node: GraphNodeRef): GraphNodeRef | null {
    if (node.kind === "DT") {
      this.assertRoot(node);
      return null;
    }

    const parentPoleId = this.parentPoleIds.get(this.assertPole(node));
    if (parentPoleId === undefined) {
      throw new Error(`Unknown pole node: ${node.poleId}`);
    }

    return parentPoleId === null ? this.rootNode : this.poleNode(parentPoleId);
  }

  ancestors(node: GraphNodeRef): readonly GraphNodeRef[] {
    const ancestors: GraphNodeRef[] = [];
    let current = this.parent(node);

    while (current) {
      ancestors.push(current);
      current = this.parent(current);
    }

    return Object.freeze(ancestors);
  }

  descendants(node: GraphNodeRef): readonly GraphNodeRef[] {
    const descendants: GraphNodeRef[] = [];
    const pending = [...this.children(node)].reverse();

    while (pending.length > 0) {
      const current = pending.pop();
      if (!current) {
        continue;
      }

      descendants.push(current);
      pending.push(...[...this.children(current)].reverse());
    }

    return Object.freeze(descendants);
  }

  subtree(node: GraphNodeRef): readonly GraphNodeRef[] {
    return Object.freeze([node, ...this.descendants(node)]);
  }

  private childIdsForRoot(): readonly string[] {
    if (this.source === "FALLBACK") {
      return Object.freeze([...this.poleNodesById.keys()]);
    }

    return Object.freeze(
      [...this.parentPoleIds.entries()]
        .filter(([, parentPoleId]) => parentPoleId === null)
        .map(([poleId]) => poleId),
    );
  }

  private poleNode(poleId: string): PoleNodeRef {
    const node = this.poleNodesById.get(poleId);
    if (!node) {
      throw new Error(`Unknown pole node: ${poleId}`);
    }
    return node;
  }

  private assertRoot(node: DistributionTransformerNodeRef): void {
    if (node.dtId !== this.rootNode.dtId) {
      throw new Error(`Unknown distribution transformer node: ${node.dtId}`);
    }
  }

  private assertPole(node: PoleNodeRef): string {
    if (!this.poleNodesById.has(node.poleId)) {
      throw new Error(`Unknown pole node: ${node.poleId}`);
    }
    return node.poleId;
  }
}

function freezeDistributionTransformerNode(
  node: DistributionTransformerNodeRef,
): DistributionTransformerNodeRef {
  return Object.freeze({
    kind: "DT",
    dtId: node.dtId,
    coordinates: Object.freeze({ ...node.coordinates }),
  });
}

function buildPoleNodeIndex(
  nodes: readonly PoleNodeRef[],
): ReadonlyMap<string, PoleNodeRef> {
  const indexedNodes = new Map<string, PoleNodeRef>();

  for (const node of nodes) {
    if (indexedNodes.has(node.poleId)) {
      throw new Error(`Duplicate pole node: ${node.poleId}`);
    }
    indexedNodes.set(
      node.poleId,
      Object.freeze({
        kind: "POLE",
        poleId: node.poleId,
        coordinates: Object.freeze({ ...node.coordinates }),
      }),
    );
  }

  return indexedNodes;
}

function buildParentIndex(
  edges: readonly TopologyEdge[],
  nodesById: ReadonlyMap<string, PoleNodeRef>,
): ReadonlyMap<string, string | null> {
  const parentPoleIds = new Map<string, string | null>(
    [...nodesById.keys()].map((poleId) => [poleId, null]),
  );

  for (const edge of edges) {
    if (!nodesById.has(edge.from_pole_id) || !nodesById.has(edge.to_pole_id)) {
      throw new Error("Topology edges must reference poles in the graph");
    }
    if (
      edge.from_pole_id === edge.to_pole_id ||
      parentPoleIds.get(edge.to_pole_id) !== null
    ) {
      throw new Error(`Invalid topology parent for pole: ${edge.to_pole_id}`);
    }
    parentPoleIds.set(edge.to_pole_id, edge.from_pole_id);
  }

  return parentPoleIds;
}

function buildChildIndex(
  parentPoleIds: ReadonlyMap<string, string | null>,
  nodesById: ReadonlyMap<string, PoleNodeRef>,
  source: TopologySource,
): ReadonlyMap<string, readonly string[]> {
  const childPoleIds = new Map<string, string[]>();

  if (source === "FALLBACK") {
    return childPoleIds;
  }

  for (const [poleId, parentPoleId] of parentPoleIds) {
    if (parentPoleId === null) {
      continue;
    }
    if (!nodesById.has(parentPoleId)) {
      throw new Error(`Unknown parent pole: ${parentPoleId}`);
    }

    const children = childPoleIds.get(parentPoleId) ?? [];
    children.push(poleId);
    childPoleIds.set(parentPoleId, children);
  }

  return new Map(
    [...childPoleIds.entries()].map(([poleId, children]) => [
      poleId,
      Object.freeze(children),
    ]),
  );
}

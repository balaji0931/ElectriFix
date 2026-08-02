import type {
  Coordinates,
  TopologyEdge,
  TopologySource,
} from "../contracts.js";

export interface DistributionTransformerNodeRef {
  readonly kind: "DT";
  readonly dtId: string;
  readonly coordinates: Coordinates;
}

export interface PoleNodeRef {
  readonly kind: "POLE";
  readonly poleId: string;
  readonly coordinates: Coordinates;
}

export type GraphNodeRef = DistributionTransformerNodeRef | PoleNodeRef;

export interface TopologyValidationResult {
  readonly status: "VALID";
}

export interface NetworkGraphInput {
  readonly source: TopologySource;
  readonly validation: TopologyValidationResult;
  readonly root: DistributionTransformerNodeRef;
  readonly nodes: readonly PoleNodeRef[];
  readonly edges: readonly TopologyEdge[];
}

export class TopologyValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TopologyValidationError";
  }
}

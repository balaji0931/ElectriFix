import type { ProductPolicies } from "../../config/policies.js";
import type {
  ConfidenceReason,
  FaultCandidate,
  TopologySource,
} from "../contracts.js";
import type { PoleState } from "../pole-state/types.js";
import type { NetworkGraph } from "../topology/network-graph.js";

export interface SuppressionContext {
  readonly suppressedPoleIds: readonly string[];
  readonly suppressionReasons: Readonly<Record<string, string>>;
}

export interface PoleLocalizationMetadata {
  readonly pincode: string | null;
}

export interface DTLocalizationInput {
  readonly feederId: string;
  readonly topology: NetworkGraph;
  readonly poleStates: readonly PoleState[];
  readonly poleMetadata: Readonly<Record<string, PoleLocalizationMetadata>>;
  readonly suppressionContext: SuppressionContext;
  readonly evaluationTime: Date;
}

export interface FeederLocalizationInput {
  readonly feederId: string;
  readonly dtInputs: readonly DTLocalizationInput[];
}

export interface Boundary {
  readonly lastLivePoleId: string;
  readonly firstDarkPoleId: string;
  readonly unmonitoredPoleIds: readonly string[];
}

export interface FaultGroup {
  readonly boundary: Boundary;
  readonly affectedPoleIds: readonly string[];
  readonly downstreamDarkPoleIds: readonly string[];
  readonly contradictory: boolean;
}

export interface ConfidenceInput {
  readonly topologySource: TopologySource;
  readonly lastLivePole: PoleState | undefined;
  readonly affectedPoleIds: readonly string[];
  readonly downstreamDarkPoleIds: readonly string[];
  readonly statesByPoleId: ReadonlyMap<string, PoleState>;
  readonly unmonitoredPoleIds: readonly string[];
  readonly contradictory: boolean;
  readonly evaluationTime: Date;
}

export interface ConfidenceResult {
  readonly level: FaultCandidate["confidence_level"];
  readonly reasons: readonly ConfidenceReason[];
}

export type LocalizationPolicies = Pick<
  ProductPolicies,
  "feederDarkThreshold" | "sensorGapThreshold" | "staleHeartbeatMinutes"
>;

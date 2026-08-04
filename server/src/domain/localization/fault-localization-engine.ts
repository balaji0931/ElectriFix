import type {
  ConfidenceReason,
  FaultCandidate,
  FaultEvidence,
  TopologySource,
} from "../contracts.js";
import type { PoleState } from "../pole-state/types.js";
import type { PoleNodeRef } from "../topology/types.js";
import {
  BoundaryFinder,
  indexPoleNodes,
  isDark,
  poleIds,
} from "./boundary-finder.js";
import { ConfidenceScorer } from "./confidence-scorer.js";
import { FaultGrouper } from "./fault-grouper.js";
import type {
  DTLocalizationInput,
  FeederLocalizationInput,
  LocalizationPolicies,
} from "./types.js";

/** Stateless deterministic localization over caller-supplied immutable inputs. */
export class FaultLocalizationEngine {
  private readonly boundaryFinder = new BoundaryFinder();
  private readonly faultGrouper = new FaultGrouper();
  private readonly confidenceScorer: ConfidenceScorer;

  constructor(policies: LocalizationPolicies) {
    this.confidenceScorer = new ConfidenceScorer(policies);
    this.policies = policies;
  }

  private readonly policies: LocalizationPolicies;

  localizeDT(input: DTLocalizationInput): readonly FaultCandidate[] {
    const statesByPoleId = indexStates(input.poleStates);
    const suppressedPoleIds = new Set(
      input.suppressionContext.suppressedPoleIds,
    );
    const nodesById = indexPoleNodes(input.topology);
    const graphPoleIds = Object.freeze([...nodesById.keys()].sort());
    const darkPoleIds = graphPoleIds.filter((poleId) => {
      const state = statesByPoleId.get(poleId);
      return Boolean(state && !suppressedPoleIds.has(poleId) && isDark(state));
    });

    if (darkPoleIds.length === 0) {
      return Object.freeze([]);
    }

    if (input.topology.source === "FALLBACK") {
      return Object.freeze([
        this.createDTCandidate(input, darkPoleIds, statesByPoleId),
      ]);
    }

    if (isDTFullyDark(input, statesByPoleId, suppressedPoleIds)) {
      return Object.freeze([
        this.createDTCandidate(input, poleIds(input.topology), statesByPoleId),
      ]);
    }

    const boundaries = this.boundaryFinder.find(
      input.topology,
      statesByPoleId,
      suppressedPoleIds,
    );
    const groups = this.faultGrouper.group(
      boundaries,
      input.topology,
      statesByPoleId,
      suppressedPoleIds,
    );

    return Object.freeze(
      groups.map((group) => {
        const lastLivePole = statesByPoleId.get(group.boundary.lastLivePoleId);
        const confidence = this.confidenceScorer.score({
          topologySource: input.topology.source,
          lastLivePole,
          affectedPoleIds: group.affectedPoleIds,
          downstreamDarkPoleIds: group.downstreamDarkPoleIds,
          statesByPoleId,
          unmonitoredPoleIds: group.boundary.unmonitoredPoleIds,
          contradictory: group.contradictory,
          evaluationTime: input.evaluationTime,
        });
        const upstream = nodeFor(nodesById, group.boundary.lastLivePoleId);
        const downstream = nodeFor(nodesById, group.boundary.firstDarkPoleId);
        const coordinates = Object.freeze({
          lat: (upstream.coordinates.lat + downstream.coordinates.lat) / 2,
          lon: (upstream.coordinates.lon + downstream.coordinates.lon) / 2,
        });
        const evidence = freezeEvidence({
          lastLivePoleId: group.boundary.lastLivePoleId,
          firstDarkPoleId: group.boundary.firstDarkPoleId,
          affectedPoleIds: group.affectedPoleIds,
          topologySource: input.topology.source,
          confidenceLevel: confidence.level,
          confidenceReasons: confidence.reasons,
          coordinates,
          pincode: resolvePincode(input, [
            group.boundary.lastLivePoleId,
            group.boundary.firstDarkPoleId,
            ...group.affectedPoleIds,
          ]),
          suppressedPoleIds: input.suppressionContext.suppressedPoleIds,
        });

        return freezeCandidate({
          fault_type: "span",
          feeder_id: input.feederId,
          dt_id: input.topology.root().dtId,
          span_pole_a: group.boundary.lastLivePoleId,
          span_pole_b: group.boundary.firstDarkPoleId,
          coordinates,
          pincode: evidence.pincode,
          affected_pole_count: group.affectedPoleIds.length,
          confidence_level: confidence.level,
          topology_source: input.topology.source,
          evidence,
        });
      }),
    );
  }

  localizeFeeder(input: FeederLocalizationInput): readonly FaultCandidate[] {
    if (input.dtInputs.length === 0) {
      return Object.freeze([]);
    }
    if (input.dtInputs.some((dtInput) => dtInput.feederId !== input.feederId)) {
      throw new Error(
        "Feeder localization inputs must belong to the requested feeder",
      );
    }

    const fullyDarkInputs = input.dtInputs.filter((dtInput) =>
      isDTFullyDark(
        dtInput,
        indexStates(dtInput.poleStates),
        new Set(dtInput.suppressionContext.suppressedPoleIds),
      ),
    );
    if (
      fullyDarkInputs.length / input.dtInputs.length <
      this.policies.feederDarkThreshold
    ) {
      return Object.freeze(
        input.dtInputs.flatMap((dtInput) => this.localizeDT(dtInput)),
      );
    }

    const primary = input.dtInputs[0]!;
    const affectedPoleIds = fullyDarkInputs.flatMap((dtInput) =>
      poleIds(dtInput.topology),
    );
    const statesByPoleId = new Map(
      fullyDarkInputs.flatMap((dtInput) =>
        dtInput.poleStates.map((state) => [state.poleId, state]),
      ),
    );
    const topologySource = feederTopologySource(fullyDarkInputs);
    const confidence = this.confidenceScorer.score({
      topologySource,
      lastLivePole: undefined,
      affectedPoleIds: affectedPoleIds.filter(
        (poleId) => statesByPoleId.get(poleId)?.hasDevice,
      ),
      downstreamDarkPoleIds: affectedPoleIds.filter((poleId) => {
        const state = statesByPoleId.get(poleId);
        return Boolean(state && isDark(state));
      }),
      statesByPoleId,
      unmonitoredPoleIds: [],
      contradictory: false,
      evaluationTime: primary.evaluationTime,
    });
    const suppressedPoleIds = fullyDarkInputs.flatMap(
      (dtInput) => dtInput.suppressionContext.suppressedPoleIds,
    );
    const evidence = freezeEvidence({
      lastLivePoleId: null,
      firstDarkPoleId: null,
      affectedPoleIds,
      topologySource,
      confidenceLevel: confidence.level,
      confidenceReasons: confidence.reasons,
      coordinates: primary.topology.root().coordinates,
      pincode: resolvePincode(primary, affectedPoleIds),
      suppressedPoleIds,
    });

    return Object.freeze([
      freezeCandidate({
        fault_type: "feeder",
        feeder_id: input.feederId,
        dt_id: primary.topology.root().dtId,
        span_pole_a: null,
        span_pole_b: null,
        coordinates: evidence.coordinates,
        pincode: evidence.pincode,
        affected_pole_count: affectedPoleIds.length,
        confidence_level: confidence.level,
        topology_source: topologySource,
        evidence,
      }),
    ]);
  }

  private createDTCandidate(
    input: DTLocalizationInput,
    affectedPoleIds: readonly string[],
    statesByPoleId: ReadonlyMap<string, PoleState>,
  ): FaultCandidate {
    const confidence = this.confidenceScorer.score({
      topologySource: input.topology.source,
      lastLivePole: undefined,
      affectedPoleIds: affectedPoleIds.filter(
        (poleId) => statesByPoleId.get(poleId)?.hasDevice,
      ),
      downstreamDarkPoleIds: affectedPoleIds.filter((poleId) => {
        const state = statesByPoleId.get(poleId);
        return Boolean(state && isDark(state));
      }),
      statesByPoleId,
      unmonitoredPoleIds: [],
      contradictory: false,
      evaluationTime: input.evaluationTime,
    });
    const evidence = freezeEvidence({
      lastLivePoleId: null,
      firstDarkPoleId: null,
      affectedPoleIds,
      topologySource: input.topology.source,
      confidenceLevel: confidence.level,
      confidenceReasons: confidence.reasons,
      coordinates: input.topology.root().coordinates,
      pincode: resolvePincode(input, affectedPoleIds),
      suppressedPoleIds: input.suppressionContext.suppressedPoleIds,
    });

    return freezeCandidate({
      fault_type: "dt",
      feeder_id: input.feederId,
      dt_id: input.topology.root().dtId,
      span_pole_a: null,
      span_pole_b: null,
      coordinates: evidence.coordinates,
      pincode: evidence.pincode,
      affected_pole_count: affectedPoleIds.length,
      confidence_level: confidence.level,
      topology_source: input.topology.source,
      evidence,
    });
  }
}

function isDTFullyDark(
  input: DTLocalizationInput,
  statesByPoleId: ReadonlyMap<string, PoleState>,
  suppressedPoleIds: ReadonlySet<string>,
): boolean {
  const monitoredStates = poleIds(input.topology)
    .filter((poleId) => !suppressedPoleIds.has(poleId))
    .map((poleId) => statesByPoleId.get(poleId))
    .filter((state): state is PoleState => Boolean(state?.hasDevice));
  return monitoredStates.length > 0 && monitoredStates.every(isDark);
}

function indexStates(
  states: readonly PoleState[],
): ReadonlyMap<string, PoleState> {
  return new Map(states.map((state) => [state.poleId, state]));
}

function nodeFor(
  nodesById: ReadonlyMap<string, import("../topology/types.js").GraphNodeRef>,
  poleId: string,
): PoleNodeRef {
  const node = nodesById.get(poleId);
  if (!node || node.kind !== "POLE") {
    throw new Error(`Localization input is missing topology pole ${poleId}`);
  }
  return node;
}

function resolvePincode(
  input: DTLocalizationInput,
  poleIdsInPriorityOrder: readonly string[],
): string | null {
  for (const poleId of poleIdsInPriorityOrder) {
    const pincode = input.poleMetadata[poleId]?.pincode;
    if (pincode) {
      return pincode;
    }
  }
  return null;
}

function feederTopologySource(
  inputs: readonly DTLocalizationInput[],
): TopologySource {
  if (inputs.some((input) => input.topology.source === "FALLBACK")) {
    return "FALLBACK";
  }
  if (inputs.some((input) => input.topology.source === "INFERRED")) {
    return "INFERRED";
  }
  return "RECORDED";
}

function freezeEvidence(input: {
  lastLivePoleId: string | null;
  firstDarkPoleId: string | null;
  affectedPoleIds: readonly string[];
  topologySource: TopologySource;
  confidenceLevel: FaultCandidate["confidence_level"];
  confidenceReasons: readonly ConfidenceReason[];
  coordinates: { readonly lat: number; readonly lon: number };
  pincode: string | null;
  suppressedPoleIds: readonly string[];
}): FaultEvidence {
  return Object.freeze({
    last_live_pole: input.lastLivePoleId,
    first_dark_pole: input.firstDarkPoleId,
    fault_span:
      input.lastLivePoleId && input.firstDarkPoleId
        ? (Object.freeze([
            input.lastLivePoleId,
            input.firstDarkPoleId,
          ]) as unknown as [string, string])
        : null,
    affected_poles: Object.freeze([
      ...input.affectedPoleIds,
    ]) as unknown as string[],
    affected_pole_count: input.affectedPoleIds.length,
    topology_source: input.topologySource,
    confidence_level: input.confidenceLevel,
    confidence_reasons: Object.freeze(
      input.confidenceReasons.map((reason) => Object.freeze({ ...reason })),
    ) as unknown as ConfidenceReason[],
    coordinates: Object.freeze({ ...input.coordinates }),
    pincode: input.pincode,
    suppressed_sensors: Object.freeze(
      [...new Set(input.suppressedPoleIds)].sort(),
    ) as unknown as string[],
  });
}

function freezeCandidate(candidate: FaultCandidate): FaultCandidate {
  return Object.freeze({
    ...candidate,
    coordinates: Object.freeze({ ...candidate.coordinates }),
    evidence: candidate.evidence,
  });
}

import { v7 as uuidv7 } from "uuid";

import type { FaultCandidate } from "../domain/contracts.js";
import type { TicketStatus } from "../domain/contracts.js";
import { DeadSensorDetector } from "../domain/noise-filter/dead-sensor-detector.js";
import { ScheduledOutageFilter } from "../domain/noise-filter/scheduled-outage-filter.js";
import type {
  NoiseFilterResult,
  ScheduledOutage,
} from "../domain/noise-filter/types.js";
import { FaultLocalizationEngine } from "../domain/localization/fault-localization-engine.js";
import type {
  DTLocalizationInput,
  FeederLocalizationInput,
  SuppressionContext,
} from "../domain/localization/types.js";
import type {
  PoleState,
  PoleStateTransition,
} from "../domain/pole-state/types.js";
import type { TopologyResolver } from "../domain/topology/topology-resolver.js";
import type { StartupSnapshot } from "../infrastructure/db/bootstrap.js";
import type {
  ActiveFaultIdentity,
  ActiveFaultUpdate,
  CreatedFaultAndTicket,
  FaultPersistenceInput,
  FaultPersistenceModel,
  TicketPersistenceInput,
  TicketPersistenceModel,
} from "../infrastructure/repositories/ticket-repository.js";

export interface FaultTicketStore {
  findActiveFault(
    identity: ActiveFaultIdentity,
  ): Promise<FaultPersistenceModel | undefined>;
  updateActiveFault(
    faultId: string,
    update: ActiveFaultUpdate,
  ): Promise<FaultPersistenceModel | undefined>;
  createFaultAndTicket(
    fault: FaultPersistenceInput,
    ticket: TicketPersistenceInput,
  ): Promise<CreatedFaultAndTicket>;
}

export interface PoleStateReader {
  getPoleState(poleId: string): PoleState | undefined;
}

export type LocalizationEvent =
  | {
      readonly type: "fault.created";
      readonly fault: FaultPersistenceModel;
    }
  | {
      readonly type: "fault.updated";
      readonly fault: FaultPersistenceModel;
    }
  | {
      readonly type: "ticket.created";
      readonly ticket: TicketPersistenceModel;
      readonly fault: FaultPersistenceModel;
    }
  | {
      readonly type: "ticket.updated";
      readonly ticket: TicketPersistenceModel;
      readonly previousStatus: TicketStatus;
    };

export interface LocalizationEventPublisher {
  publish(event: LocalizationEvent): void;
}

export interface ScheduledOutageProvider {
  listScheduledOutages(): Promise<ReadonlyArray<ScheduledOutage>>;
}

export interface LocalizeFaultsDependencies {
  readonly startupSnapshot: StartupSnapshot;
  readonly poleStateReader: PoleStateReader;
  readonly topologyResolver: TopologyResolver;
  readonly localizationEngine: FaultLocalizationEngine;
  readonly deadSensorDetector: DeadSensorDetector;
  readonly scheduledOutageFilter: ScheduledOutageFilter;
  readonly scheduledOutageProvider: ScheduledOutageProvider;
  readonly faultTicketStore: FaultTicketStore;
  readonly publisher: LocalizationEventPublisher;
}

/**
 * Application-layer coordinator for localization and fault/ticket persistence.
 * It serializes transition handling so active-fault lookup and creation remain
 * deterministic in the single-process pipeline used by this assignment.
 */
export class LocalizeFaults {
  private pending: Promise<void> = Promise.resolve();

  constructor(private readonly dependencies: LocalizeFaultsDependencies) {}

  handleTransition(transition: PoleStateTransition): Promise<void> {
    const run = this.pending.then(() => this.localizeTransition(transition));
    this.pending = run.catch(() => undefined);
    return run;
  }

  private async localizeTransition(
    transition: PoleStateTransition,
  ): Promise<void> {
    if (!triggersLocalization(transition)) {
      return;
    }

    const pole = this.dependencies.startupSnapshot.poles.find(
      (candidate) => candidate.poleId === transition.currentState.poleId,
    );
    if (!pole) {
      throw new Error(
        `Localization transition references unknown pole ${transition.currentState.poleId}`,
      );
    }

    const evaluationTime = new Date(transition.currentState.updatedAt);
    const outages =
      await this.dependencies.scheduledOutageProvider.listScheduledOutages();
    const dtInput = this.buildDTInput(pole.dtId, evaluationTime, outages);
    const dtCandidates =
      this.dependencies.localizationEngine.localizeDT(dtInput);
    const candidates = await this.selectCandidates(
      pole.feederId,
      dtInput,
      dtCandidates,
      evaluationTime,
      outages,
    );

    for (const candidate of candidates) {
      await this.persistCandidate(candidate, evaluationTime);
    }
  }

  private async selectCandidates(
    feederId: string,
    dtInput: DTLocalizationInput,
    dtCandidates: readonly FaultCandidate[],
    evaluationTime: Date,
    outages: readonly ScheduledOutage[],
  ): Promise<readonly FaultCandidate[]> {
    if (!dtCandidates.some((candidate) => candidate.fault_type === "dt")) {
      return dtCandidates;
    }

    const dtInputs = this.dependencies.startupSnapshot.distributionTransformers
      .filter((transformer) => transformer.feederId === feederId)
      .sort((left, right) => left.dtId.localeCompare(right.dtId))
      .map((transformer) =>
        transformer.dtId === dtInput.topology.root().dtId
          ? dtInput
          : this.buildDTInput(transformer.dtId, evaluationTime, outages),
      );
    const feederInput: FeederLocalizationInput = Object.freeze({
      feederId,
      dtInputs: Object.freeze(dtInputs),
    });
    const feederCandidates =
      this.dependencies.localizationEngine.localizeFeeder(feederInput);

    return feederCandidates.some(
      (candidate) => candidate.fault_type === "feeder",
    )
      ? feederCandidates
      : dtCandidates;
  }

  private buildDTInput(
    dtId: string,
    evaluationTime: Date,
    outages: readonly ScheduledOutage[],
  ): DTLocalizationInput {
    const transformer =
      this.dependencies.startupSnapshot.distributionTransformers.find(
        (candidate) => candidate.dtId === dtId,
      );
    if (!transformer) {
      throw new Error(
        `Cannot localize unknown distribution transformer ${dtId}`,
      );
    }

    const topology = this.dependencies.topologyResolver.resolve(dtId);
    const poles = this.dependencies.startupSnapshot.poles.filter(
      (pole) => pole.dtId === dtId,
    );
    const poleStates = poles.map((pole) => {
      const state = this.dependencies.poleStateReader.getPoleState(pole.poleId);
      if (!state) {
        throw new Error(`Pole state is unavailable for ${pole.poleId}`);
      }
      return state;
    });
    const statesByPoleId = new Map(
      poleStates.map((state) => [state.poleId, state]),
    );
    const suppressionContext = this.buildSuppressionContext(
      transformer.feederId,
      transformer.dtId,
      topology,
      poleStates,
      statesByPoleId,
      outages,
      evaluationTime,
    );

    return Object.freeze({
      feederId: transformer.feederId,
      topology,
      poleStates: Object.freeze(poleStates),
      poleMetadata: Object.freeze(
        Object.fromEntries(
          poles.map((pole) => [
            pole.poleId,
            Object.freeze({ pincode: pole.pincode }),
          ]),
        ),
      ),
      suppressionContext,
      evaluationTime: new Date(evaluationTime),
    });
  }

  private buildSuppressionContext(
    feederId: string,
    dtId: string,
    topology: ReturnType<TopologyResolver["resolve"]>,
    poleStates: readonly PoleState[],
    statesByPoleId: ReadonlyMap<string, PoleState>,
    outages: readonly ScheduledOutage[],
    evaluationTime: Date,
  ): SuppressionContext {
    const suppressed = new Map<string, string>();
    const outageResult = this.dependencies.scheduledOutageFilter.evaluate({
      feederId,
      distributionTransformerId: dtId,
      outages,
      now: evaluationTime,
    });
    if (outageResult.decision === "SUPPRESS") {
      for (const poleState of poleStates) {
        suppressed.set(poleState.poleId, outageResult.reasonCode);
      }
    }

    for (const poleState of poleStates) {
      const result = this.dependencies.deadSensorDetector.evaluate({
        poleState,
        poleStates: statesByPoleId,
        topology,
      });
      addSuppression(suppressed, poleState.poleId, result);
    }

    return Object.freeze({
      suppressedPoleIds: Object.freeze([...suppressed.keys()].sort()),
      suppressionReasons: Object.freeze(
        Object.fromEntries(
          [...suppressed.entries()].sort(([left], [right]) =>
            left.localeCompare(right),
          ),
        ),
      ),
    });
  }

  private async persistCandidate(
    candidate: FaultCandidate,
    observedAt: Date,
  ): Promise<void> {
    const identity = activeFaultIdentity(candidate);
    const activeFault =
      await this.dependencies.faultTicketStore.findActiveFault(identity);

    if (activeFault) {
      const updated =
        await this.dependencies.faultTicketStore.updateActiveFault(
          activeFault.faultId,
          {
            affectedPoleCount: candidate.affected_pole_count,
            confidenceLevel: candidate.confidence_level,
            updatedAt: observedAt,
          },
        );
      if (!updated) {
        throw new Error(
          `Active fault ${activeFault.faultId} disappeared during localization`,
        );
      }
      this.dependencies.publisher.publish(
        Object.freeze({ type: "fault.updated", fault: updated }),
      );
      return;
    }

    const faultId = uuidv7();
    const ticketId = uuidv7();
    const created =
      await this.dependencies.faultTicketStore.createFaultAndTicket(
        faultPersistenceInput(candidate, faultId, observedAt),
        ticketPersistenceInput(ticketId, faultId, observedAt),
      );
    this.dependencies.publisher.publish(
      Object.freeze({ type: "fault.created", fault: created.fault }),
    );
    this.dependencies.publisher.publish(
      Object.freeze({
        type: "ticket.created",
        ticket: created.ticket,
        fault: created.fault,
      }),
    );
  }
}

function triggersLocalization(transition: PoleStateTransition): boolean {
  const wasDark = isDark(transition.previousState.energized);
  return !wasDark && isDark(transition.currentState.energized);
}

function isDark(energized: PoleState["energized"]): boolean {
  return energized === "DARK" || energized === "PRESUMED_DARK";
}

function addSuppression(
  suppressed: Map<string, string>,
  poleId: string,
  result: NoiseFilterResult,
): void {
  if (result.decision === "SUPPRESS") {
    suppressed.set(poleId, result.reasonCode);
  }
}

function activeFaultIdentity(candidate: FaultCandidate): ActiveFaultIdentity {
  switch (candidate.fault_type) {
    case "span":
      if (!candidate.span_pole_a || !candidate.span_pole_b) {
        throw new Error("Span fault candidates require both boundary poles");
      }
      return Object.freeze({
        faultType: "span",
        dtId: candidate.dt_id,
        spanPoleA: candidate.span_pole_a,
        spanPoleB: candidate.span_pole_b,
      });
    case "dt":
      return Object.freeze({
        faultType: "dt",
        dtId: candidate.dt_id,
        ...(candidate.topology_source === "FALLBACK"
          ? { topologySource: "FALLBACK" as const }
          : {}),
      });
    case "feeder":
      return Object.freeze({
        faultType: "feeder",
        feederId: candidate.feeder_id,
      });
  }
}

function faultPersistenceInput(
  candidate: FaultCandidate,
  faultId: string,
  observedAt: Date,
): FaultPersistenceInput {
  return {
    faultId,
    dtId: candidate.dt_id,
    feederId: candidate.feeder_id,
    faultType: candidate.fault_type,
    status: "active",
    spanPoleA: candidate.span_pole_a,
    spanPoleB: candidate.span_pole_b,
    lat: candidate.coordinates.lat,
    lon: candidate.coordinates.lon,
    pincode: candidate.pincode,
    affectedPoleCount: candidate.affected_pole_count,
    confidenceLevel: candidate.confidence_level,
    topologySource: candidate.topology_source,
    evidence: candidate.evidence as unknown as Record<string, unknown>,
    aiSummary: null,
    mergedIntoFaultId: null,
    detectedAt: observedAt,
    resolvedAt: null,
    createdAt: observedAt,
    updatedAt: observedAt,
  };
}

function ticketPersistenceInput(
  ticketId: string,
  faultId: string,
  observedAt: Date,
): TicketPersistenceInput {
  return {
    ticketId,
    faultId,
    status: "detected",
    assignedCrew: null,
    operatorNotes: null,
    rejectionCount: 0,
    rejectionReason: null,
    detectedAt: observedAt,
    acknowledgedAt: null,
    crewAssignedAt: null,
    resolvedAt: null,
    verifiedAt: null,
    closedAt: null,
    createdAt: observedAt,
    updatedAt: observedAt,
  };
}

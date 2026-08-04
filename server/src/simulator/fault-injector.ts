import type { FaultType } from "../domain/contracts.js";
import type { TopologyResolver } from "../domain/topology/topology-resolver.js";
import type { StartupSnapshot } from "../infrastructure/db/bootstrap.js";
import { TelemetryProducer } from "./telemetry-producer.js";
import type { FaultSimulationPlan, SimulationOptions } from "./types.js";

export class SimulationValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SimulationValidationError";
  }
}

export class SimulationTargetNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SimulationTargetNotFoundError";
  }
}

export interface FaultInjectionRandomizer {
  fraction(purpose: "fw12" | "delivery" | "clock", poleId: string): number;
}

export class FaultInjector {
  constructor(
    private readonly snapshot: StartupSnapshot,
    private readonly topologyResolver: TopologyResolver,
    private readonly telemetryProducer: TelemetryProducer,
    private readonly randomizer: FaultInjectionRandomizer = stableRandomizer,
  ) {}

  inject(input: {
    faultType: FaultType;
    targetId: string;
    spanPoleA?: string;
    spanPoleB?: string;
    options: SimulationOptions;
    now: Date;
  }): FaultSimulationPlan {
    const affectedPoleIds = this.affectedPoles(input);
    const telemetry = [];
    let eventsDropped = 0;

    for (const poleId of affectedPoleIds) {
      const pole = this.snapshot.poles.find(
        (candidate) => candidate.poleId === poleId,
      );
      if (
        !pole?.deviceId ||
        isFirmware12(poleId, input.options.fw12Percentage, this.randomizer)
      ) {
        eventsDropped += 1;
        continue;
      }
      if (
        !delivered(poleId, input.options.powerLostDeliveryRate, this.randomizer)
      ) {
        eventsDropped += 1;
        continue;
      }
      const event = this.telemetryProducer.powerLost(
        poleId,
        skewedTime(
          input.now,
          poleId,
          input.options.clockSkewSeconds,
          this.randomizer,
        ),
      );
      telemetry.push(event);
      if (input.options.includeDuplicates) {
        telemetry.push(this.telemetryProducer.duplicate(event));
      }
    }

    return Object.freeze({
      faultType: input.faultType,
      targetId: input.targetId,
      affectedPoleIds: Object.freeze(affectedPoleIds),
      telemetry: Object.freeze(telemetry),
      eventsDropped,
    });
  }

  private affectedPoles(input: {
    faultType: FaultType;
    targetId: string;
    spanPoleA?: string;
    spanPoleB?: string;
  }): readonly string[] {
    if (input.faultType === "feeder") {
      const dts = this.snapshot.distributionTransformers.filter(
        (transformer) => transformer.feederId === input.targetId,
      );
      if (dts.length === 0) {
        throw new SimulationTargetNotFoundError("Unknown feeder target_id");
      }
      return Object.freeze(
        dts.flatMap((transformer) => this.polesForDt(transformer.dtId)),
      );
    }

    const transformer = this.snapshot.distributionTransformers.find(
      (candidate) => candidate.dtId === input.targetId,
    );
    if (!transformer) {
      throw new SimulationTargetNotFoundError(
        "Unknown distribution transformer target_id",
      );
    }
    if (input.faultType === "dt") {
      return this.polesForDt(transformer.dtId);
    }

    const topology = this.topologyResolver.resolve(transformer.dtId);
    if (topology.source !== "RECORDED") {
      throw new SimulationValidationError(
        "Span faults require recorded topology",
      );
    }
    const segments = topology
      .descendants(topology.root())
      .filter((node) => node.kind === "POLE")
      .flatMap((node) => {
        const parent = topology.parent(node);
        return parent?.kind === "POLE"
          ? [[parent.poleId, node.poleId] as const]
          : [];
      });
    const selected =
      input.spanPoleA && input.spanPoleB
        ? segments.find(
            ([upstream, downstream]) =>
              upstream === input.spanPoleA && downstream === input.spanPoleB,
          )
        : segments[0];
    if (!selected) {
      throw new SimulationValidationError(
        "Span poles must be adjacent under the target DT",
      );
    }
    const downstream = topology
      .subtree({
        kind: "POLE",
        poleId: selected[1],
        coordinates: topology
          .descendants(topology.root())
          .find((node) => node.kind === "POLE" && node.poleId === selected[1])!
          .coordinates,
      })
      .filter((node) => node.kind === "POLE")
      .map((node) => node.poleId);
    return Object.freeze(downstream);
  }

  private polesForDt(dtId: string): readonly string[] {
    return Object.freeze(
      this.snapshot.poles
        .filter((pole) => pole.dtId === dtId)
        .map((pole) => pole.poleId),
    );
  }
}

function stableFraction(value: string): number {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 2 ** 32;
}

const stableRandomizer: FaultInjectionRandomizer = Object.freeze({
  fraction(purpose: "fw12" | "delivery" | "clock", poleId: string): number {
    return stableFraction(`${purpose}:${poleId}`);
  },
});

function isFirmware12(
  poleId: string,
  percentage: number,
  randomizer: FaultInjectionRandomizer,
): boolean {
  return randomizer.fraction("fw12", poleId) < percentage;
}

function delivered(
  poleId: string,
  rate: number,
  randomizer: FaultInjectionRandomizer,
): boolean {
  return randomizer.fraction("delivery", poleId) < rate;
}

function skewedTime(
  now: Date,
  poleId: string,
  maxSeconds: number,
  randomizer: FaultInjectionRandomizer,
): Date {
  const skew = Math.round(
    (randomizer.fraction("clock", poleId) * 2 - 1) * maxSeconds * 1_000,
  );
  return new Date(now.getTime() + skew);
}

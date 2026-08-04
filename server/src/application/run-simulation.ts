import { v7 as uuidv7 } from "uuid";

import type { FaultType, SimulatorNoiseType } from "../domain/contracts.js";
import type { IngestTelemetry } from "./ingest-telemetry.js";
import type { FaultInjector } from "../simulator/fault-injector.js";
import { SimulationValidationError } from "../simulator/fault-injector.js";
import type { NetworkGenerator } from "../simulator/network-generator.js";
import type { NoiseGenerator } from "../simulator/noise-generator.js";
import type { RepairExecutor } from "../simulator/repair-executor.js";
import type {
  GeneratedTelemetry,
  NoiseSimulationOptions,
  SimulationOptions,
} from "../simulator/types.js";
import type { FaultPersistenceModel } from "../infrastructure/repositories/ticket-repository.js";

export class SimulationConflictError extends Error {}
export class SimulationNotFoundError extends Error {}

export interface SimulationFaultStore {
  findFaultById(faultId: string): Promise<FaultPersistenceModel | undefined>;
}

export type SimulationEvent =
  | {
      readonly type: "simulation.started";
      readonly simulationId: string;
      readonly faultType: FaultType | null;
      readonly targetId: string | null;
    }
  | {
      readonly type: "simulation.completed";
      readonly simulationId: string;
      readonly result: "fault_detected" | "repair_verified";
      readonly faultId: string | null;
      readonly ticketId: null;
      readonly durationMs: number;
    };

export interface SimulationPublisher {
  publish(event: SimulationEvent): void;
}

const defaults: SimulationOptions = Object.freeze({
  fw12Percentage: 0.08,
  powerLostDeliveryRate: 0.7,
  clockSkewSeconds: 90,
  includeDuplicates: false,
});

export class RunSimulation {
  private readonly activeTargets = new Set<string>();

  constructor(
    private readonly ingestTelemetry: IngestTelemetry,
    private readonly networkGenerator: NetworkGenerator,
    private readonly faultInjector: FaultInjector,
    private readonly noiseGenerator: NoiseGenerator,
    private readonly repairExecutor: RepairExecutor,
    private readonly faultStore: SimulationFaultStore,
    private readonly publisher: SimulationPublisher,
  ) {}

  scenarios() {
    return this.networkGenerator.scenarios();
  }

  async injectFault(input: {
    faultType: FaultType;
    targetId: string;
    spanPoleA?: string;
    spanPoleB?: string;
    options?: Record<string, unknown>;
  }) {
    const lockKey = `fault:${input.targetId}`;
    this.claim(lockKey);
    let plan;
    try {
      plan = this.faultInjector.inject({
        ...input,
        options: optionsFor(input.options),
        now: new Date(),
      });
    } catch (error) {
      this.activeTargets.delete(lockKey);
      throw error;
    }
    return this.start(
      lockKey,
      plan.telemetry,
      {
        faultType: plan.faultType,
        targetId: plan.targetId,
        result: "fault_detected",
      },
      {
        fault_type: plan.faultType,
        target_id: plan.targetId,
        expected_dark_poles: plan.affectedPoleIds.length,
        events_generated: plan.telemetry.length,
        events_dropped: plan.eventsDropped,
      },
    );
  }

  async repair(faultId: string) {
    const fault = await this.faultStore.findFaultById(faultId);
    if (!fault) throw new SimulationNotFoundError("Fault not found");
    if (fault.status !== "active")
      throw new SimulationConflictError("Fault is already resolved");
    const lockKey = `repair:${faultId}`;
    this.claim(lockKey);
    let telemetry;
    try {
      telemetry = this.repairExecutor.repair(fault, new Date());
    } catch (error) {
      this.activeTargets.delete(lockKey);
      throw error;
    }
    return this.start(
      lockKey,
      telemetry,
      { faultType: null, targetId: null, result: "repair_verified", faultId },
      {
        fault_id: faultId,
        poles_restoring: telemetry.length / 2,
        events_generated: telemetry.length,
      },
    );
  }

  async injectNoise(input: {
    noiseType: SimulatorNoiseType;
    targetPoleId?: string;
    options?: Record<string, unknown>;
  }) {
    const lockKey = `noise:${input.noiseType}:${input.targetPoleId ?? ""}`;
    this.claim(lockKey);
    let plan;
    try {
      plan = this.noiseGenerator.inject({
        ...input,
        targetPoleId: input.targetPoleId ?? null,
        options: noiseOptionsFor(input.options),
        now: new Date(),
      });
    } catch (error) {
      this.activeTargets.delete(lockKey);
      throw error;
    }
    return this.start(
      lockKey,
      plan.telemetry,
      { faultType: null, targetId: null, result: "fault_detected" },
      { noise_type: plan.noiseType, events_generated: plan.telemetry.length },
    );
  }

  private start(
    lockKey: string,
    telemetry: readonly GeneratedTelemetry[],
    metadata: {
      faultType: FaultType | null;
      targetId: string | null;
      result: "fault_detected" | "repair_verified";
      faultId?: string;
    },
    receipt: Record<string, unknown>,
  ) {
    const simulationId = uuidv7();
    const startedAt = new Date();
    this.publisher.publish(
      Object.freeze({
        type: "simulation.started",
        simulationId,
        faultType: metadata.faultType,
        targetId: metadata.targetId,
      }),
    );
    queueMicrotask(
      () =>
        void this.run(lockKey, simulationId, telemetry, metadata, startedAt),
    );
    return Object.freeze({
      simulation_id: simulationId,
      status: "running",
      ...receipt,
      started_at: startedAt.toISOString(),
    });
  }

  private async run(
    lockKey: string,
    simulationId: string,
    telemetry: readonly GeneratedTelemetry[],
    metadata: {
      result: "fault_detected" | "repair_verified";
      faultId?: string;
    },
    startedAt: Date,
  ): Promise<void> {
    try {
      for (const generated of telemetry) {
        if (generated.delayMs && generated.delayMs > 0) {
          await delay(generated.delayMs);
        }
        const admission = await this.ingestTelemetry.ingest(generated.event);
        if (admission.status !== generated.expectedAdmission) {
          throw new Error(
            `Unexpected telemetry admission: expected ${generated.expectedAdmission}, received ${admission.status}`,
          );
        }
      }
      this.publisher.publish(
        Object.freeze({
          type: "simulation.completed",
          simulationId,
          result: metadata.result,
          faultId: metadata.faultId ?? null,
          ticketId: null,
          durationMs: Date.now() - startedAt.getTime(),
        }),
      );
    } finally {
      this.activeTargets.delete(lockKey);
    }
  }

  private claim(lockKey: string): void {
    if (this.activeTargets.has(lockKey))
      throw new SimulationConflictError(
        "Active simulation already running for this target",
      );
    this.activeTargets.add(lockKey);
  }
}

function noiseOptionsFor(
  value: Record<string, unknown> | undefined,
): NoiseSimulationOptions {
  return {
    count: numberOption(value?.count, 1, "count", 1, Number.MAX_SAFE_INTEGER),
    delaySeconds: numberOption(
      value?.delay_seconds,
      0,
      "delay_seconds",
      0,
      Number.MAX_SAFE_INTEGER,
    ),
  };
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function optionsFor(
  value: Record<string, unknown> | undefined,
): SimulationOptions {
  return {
    fw12Percentage: numberOption(
      value?.fw12_percentage,
      defaults.fw12Percentage,
      "fw12_percentage",
      0,
      1,
    ),
    powerLostDeliveryRate: numberOption(
      value?.power_lost_delivery_rate,
      defaults.powerLostDeliveryRate,
      "power_lost_delivery_rate",
      0,
      1,
    ),
    clockSkewSeconds: numberOption(
      value?.clock_skew_seconds,
      defaults.clockSkewSeconds,
      "clock_skew_seconds",
      0,
      Number.MAX_SAFE_INTEGER,
    ),
    includeDuplicates:
      value?.include_duplicates === undefined
        ? defaults.includeDuplicates
        : booleanOption(value.include_duplicates, "include_duplicates"),
  };
}
function numberOption(
  value: unknown,
  fallback: number,
  name: string,
  min: number,
  max: number,
): number {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || value < min || value > max)
    throw new SimulationValidationError(`Invalid ${name}`);
  return value;
}
function booleanOption(value: unknown, name: string): boolean {
  if (typeof value !== "boolean")
    throw new SimulationValidationError(`Invalid ${name}`);
  return value;
}

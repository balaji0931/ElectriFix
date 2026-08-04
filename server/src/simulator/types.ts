import type { FaultType, SimulatorNoiseType } from "../domain/contracts.js";
import type { TelemetryEventRequest } from "../presentation/contracts/api.schemas.js";

export type ExpectedAdmission =
  "accepted" | "duplicate" | "stale" | "business_rejected";

export interface GeneratedTelemetry {
  readonly event: TelemetryEventRequest;
  readonly expectedAdmission: ExpectedAdmission;
  readonly delayMs?: number;
}

export interface SimulationOptions {
  readonly fw12Percentage: number;
  readonly powerLostDeliveryRate: number;
  readonly clockSkewSeconds: number;
  readonly includeDuplicates: boolean;
}

export interface FaultSimulationPlan {
  readonly faultType: FaultType;
  readonly targetId: string;
  readonly affectedPoleIds: readonly string[];
  readonly telemetry: readonly GeneratedTelemetry[];
  readonly eventsDropped: number;
}

export interface NoiseSimulationPlan {
  readonly noiseType: SimulatorNoiseType;
  readonly targetPoleId: string | null;
  readonly telemetry: readonly GeneratedTelemetry[];
}

export interface NoiseSimulationOptions {
  readonly count: number;
  readonly delaySeconds: number;
}

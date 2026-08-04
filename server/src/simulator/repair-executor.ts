import type { FaultPersistenceModel } from "../infrastructure/repositories/ticket-repository.js";
import type { TelemetryProducer } from "./telemetry-producer.js";
import type { GeneratedTelemetry } from "./types.js";

export class RepairExecutor {
  constructor(private readonly telemetryProducer: TelemetryProducer) {}

  repair(
    fault: FaultPersistenceModel,
    now: Date,
  ): readonly GeneratedTelemetry[] {
    const evidence = fault.evidence as { affected_poles?: unknown };
    if (!Array.isArray(evidence.affected_poles)) {
      throw new Error(
        `Fault ${fault.faultId} has invalid affected pole evidence`,
      );
    }
    return Object.freeze(
      evidence.affected_poles.flatMap((poleId) =>
        typeof poleId === "string"
          ? this.telemetryProducer.bootAndRestore(poleId, now)
          : [],
      ),
    );
  }
}

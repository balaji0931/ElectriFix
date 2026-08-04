import type { SimulatorNoiseType } from "../domain/contracts.js";
import type { StartupSnapshot } from "../infrastructure/db/bootstrap.js";
import {
  SimulationTargetNotFoundError,
  SimulationValidationError,
} from "./fault-injector.js";
import { TelemetryProducer } from "./telemetry-producer.js";
import type { NoiseSimulationOptions, NoiseSimulationPlan } from "./types.js";

export class NoiseGenerator {
  constructor(
    private readonly telemetryProducer: TelemetryProducer,
    private readonly snapshot: StartupSnapshot,
  ) {}

  inject(input: {
    noiseType: SimulatorNoiseType;
    targetPoleId: string | null;
    options: NoiseSimulationOptions;
    now: Date;
  }): NoiseSimulationPlan {
    const targetPoleId = this.targetPoleId(input);
    const telemetry = [];

    for (
      let repetition = 0;
      repetition < input.options.count;
      repetition += 1
    ) {
      telemetry.push(
        ...this.telemetryForRepetition(
          input.noiseType,
          targetPoleId,
          input.now,
          input.options.delaySeconds,
        ),
      );
    }

    return Object.freeze({
      noiseType: input.noiseType,
      targetPoleId,
      telemetry: Object.freeze(telemetry),
    });
  }

  private telemetryForRepetition(
    noiseType: SimulatorNoiseType,
    targetPoleId: string,
    now: Date,
    delaySeconds: number,
  ) {
    const base = this.telemetryProducer.heartbeat(targetPoleId, now);
    switch (noiseType) {
      case "duplicate_telemetry":
        return [base, this.telemetryProducer.duplicate(base)];
      case "stale_retry": {
        const newer = this.telemetryProducer.heartbeat(
          targetPoleId,
          new Date(now.getTime() + 1),
        );
        return [
          newer,
          Object.freeze({
            ...this.telemetryProducer.staleBefore(newer),
            delayMs: delaySeconds * 1_000,
          }),
        ];
      }
      case "out_of_order": {
        const newer = this.telemetryProducer.heartbeat(
          targetPoleId,
          new Date(now.getTime() + 1),
        );
        return [newer, this.telemetryProducer.staleBefore(newer)];
      }
      case "dead_sensor":
        return [this.telemetryProducer.powerLost(targetPoleId, now)];
    }
  }

  private targetPoleId(input: {
    noiseType: SimulatorNoiseType;
    targetPoleId: string | null;
  }): string {
    if (input.targetPoleId) {
      const pole = this.snapshot.poles.find(
        (candidate) => candidate.poleId === input.targetPoleId,
      );
      if (!pole) {
        throw new SimulationTargetNotFoundError("Unknown target_pole_id");
      }
      if (!pole.deviceId) {
        throw new SimulationValidationError(
          "Noise simulation target_pole_id must have a device",
        );
      }
      return pole.poleId;
    }
    if (input.noiseType === "dead_sensor") {
      throw new SimulationValidationError(
        "dead_sensor noise requires target_pole_id",
      );
    }
    const pole = [...this.snapshot.poles]
      .filter((candidate) => candidate.deviceId !== null)
      .sort((left, right) => left.poleId.localeCompare(right.poleId))[0];
    if (!pole) {
      throw new SimulationTargetNotFoundError(
        "No device-equipped pole is available for noise simulation",
      );
    }
    return pole.poleId;
  }
}

import type { StartupSnapshot } from "../infrastructure/db/bootstrap.js";

/** Read-only simulator view of the seeded registry. */
export class NetworkGenerator {
  constructor(private readonly snapshot: StartupSnapshot) {}

  scenarios() {
    return Object.freeze({
      fault_types: Object.freeze(["span", "dt", "feeder"]),
      noise_types: Object.freeze([
        "dead_sensor",
        "duplicate_telemetry",
        "stale_retry",
        "out_of_order",
      ]),
      targets: Object.freeze({
        feeders: Object.freeze(
          this.snapshot.feeders.map((feeder) =>
            Object.freeze({
              feeder_id: feeder.feederId,
              dt_count: this.snapshot.distributionTransformers.filter(
                (transformer) => transformer.feederId === feeder.feederId,
              ).length,
              pole_count: this.snapshot.poles.filter(
                (pole) => pole.feederId === feeder.feederId,
              ).length,
            }),
          ),
        ),
        dts: Object.freeze(
          this.snapshot.distributionTransformers.map((transformer) =>
            Object.freeze({
              dt_id: transformer.dtId,
              feeder_id: transformer.feederId,
              pole_count: this.snapshot.poles.filter(
                (pole) => pole.dtId === transformer.dtId,
              ).length,
              has_recorded_topology: transformer.hasRecordedTopology,
            }),
          ),
        ),
      }),
    });
  }

  defaultDevicePoleId(): string {
    const pole = [...this.snapshot.poles]
      .filter((candidate) => candidate.deviceId !== null)
      .sort((left, right) => left.poleId.localeCompare(right.poleId))[0];
    if (!pole) {
      throw new Error("Simulator requires at least one device-equipped pole");
    }
    return pole.poleId;
  }
}

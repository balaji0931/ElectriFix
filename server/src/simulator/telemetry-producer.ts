import type { StartupSnapshot } from "../infrastructure/db/bootstrap.js";
import type { GeneratedTelemetry } from "./types.js";

export class TelemetryProducer {
  private readonly cursors = new Map<
    string,
    { bootCounter: number; seq: number }
  >();
  private readonly polesById: ReadonlyMap<
    string,
    (typeof this.snapshot.poles)[number]
  >;

  constructor(private readonly snapshot: StartupSnapshot) {
    this.polesById = new Map(snapshot.poles.map((pole) => [pole.poleId, pole]));
    for (const state of snapshot.poleStates) {
      this.cursors.set(state.poleId, {
        bootCounter: state.lastBootCounter ?? 0,
        seq: state.lastSeq ?? 0,
      });
    }
  }

  powerLost(poleId: string, timestamp: Date): GeneratedTelemetry {
    return this.event(poleId, "power_lost", false, timestamp, false);
  }

  heartbeat(poleId: string, timestamp: Date): GeneratedTelemetry {
    return this.event(poleId, "heartbeat", true, timestamp, false);
  }

  bootAndRestore(
    poleId: string,
    timestamp: Date,
  ): readonly GeneratedTelemetry[] {
    const cursor = this.cursor(poleId);
    cursor.bootCounter += 1;
    cursor.seq = 0;
    const boot = this.event(poleId, "boot", true, timestamp, true);
    const restored = this.event(
      poleId,
      "power_restored",
      true,
      new Date(timestamp.getTime() + 1),
      false,
    );
    return Object.freeze([boot, restored]);
  }

  duplicate(event: GeneratedTelemetry): GeneratedTelemetry {
    return Object.freeze({
      event: { ...event.event },
      expectedAdmission: "duplicate",
    });
  }

  staleBefore(event: GeneratedTelemetry): GeneratedTelemetry {
    return Object.freeze({
      event: { ...event.event, seq: Math.max(0, event.event.seq - 1) },
      expectedAdmission: "stale",
    });
  }

  private event(
    poleId: string,
    event: "heartbeat" | "power_lost" | "power_restored" | "boot",
    energized: boolean,
    timestamp: Date,
    keepSequence: boolean,
  ): GeneratedTelemetry {
    const pole = this.polesById.get(poleId);
    if (!pole?.deviceId) {
      throw new Error(
        `Cannot generate telemetry for pole without device: ${poleId}`,
      );
    }
    const cursor = this.cursor(poleId);
    if (!keepSequence) {
      cursor.seq += 1;
    }
    return Object.freeze({
      event: Object.freeze({
        device_id: pole.deviceId,
        pole_id: poleId,
        event,
        energized,
        ts: timestamp.toISOString(),
        boot_counter: cursor.bootCounter,
        seq: cursor.seq,
        fw: "1.3.0",
      }),
      expectedAdmission: "accepted",
    });
  }

  private cursor(poleId: string) {
    const cursor = this.cursors.get(poleId) ?? { bootCounter: 0, seq: 0 };
    this.cursors.set(poleId, cursor);
    return cursor;
  }
}

import { v7 as uuidv7 } from "uuid";

import type { StartupSnapshot } from "./db/bootstrap.js";
import type { TelemetryRepository } from "./repositories/telemetry-repository.js";
import type { PoleStateService } from "../domain/pole-state/pole-state-service.js";
import type { TelemetryEventRequest } from "../presentation/contracts/api.schemas.js";

const BUFFER_CAPACITY = 8_192;
const DRAIN_INTERVAL_MS = 50;

export class TelemetryBusinessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TelemetryBusinessError";
  }
}

export class PipelineBufferFullError extends Error {
  constructor() {
    super("Telemetry pipeline buffer is full");
    this.name = "PipelineBufferFullError";
  }
}

export interface TelemetryCompletion {
  readonly telemetryId: string;
  readonly deviceId: string;
  readonly poleId: string;
  readonly bootCounter: number;
  readonly seq: number;
}

export type TelemetryCompletionListener = (
  completion: TelemetryCompletion,
) => void;

export type TelemetryAdmission =
  | { readonly status: "accepted" }
  | { readonly status: "duplicate" }
  | { readonly status: "stale" }
  | { readonly status: "business_rejected"; readonly message: string };

export interface TelemetryPipelineLogger {
  error: (object: Record<string, unknown>, message: string) => void;
}

interface QueuedTelemetry {
  readonly telemetryId: string;
  readonly input: TelemetryEventRequest;
  readonly receivedAt: Date;
  readonly tupleKey: string;
}

interface StreamCursor {
  readonly bootCounter: number;
  readonly seq: number;
}

/**
 * Coordinates telemetry admission and durable processing. It owns only its
 * fixed FIFO buffer and pending ordering cursors; PoleStateService owns state.
 */
export class EventPipeline {
  private readonly polesById: ReadonlyMap<
    string,
    { readonly deviceId: string | null }
  >;
  private readonly buffer: QueuedTelemetry[] = [];
  private readonly admittedTuples = new Set<string>();
  private readonly pendingCursors = new Map<string, StreamCursor>();
  private readonly listeners = new Set<TelemetryCompletionListener>();
  private draining = false;
  private readonly timer: ReturnType<typeof setInterval>;

  constructor(
    startupSnapshot: StartupSnapshot,
    private readonly telemetryRepository: TelemetryRepository,
    private readonly poleStateService: PoleStateService,
    private readonly logger: TelemetryPipelineLogger,
  ) {
    this.polesById = new Map(
      startupSnapshot.poles.map((pole) => [
        pole.poleId,
        { deviceId: pole.deviceId },
      ]),
    );
    this.timer = setInterval(() => {
      void this.drain();
    }, DRAIN_INTERVAL_MS);
    this.timer.unref();
  }

  async admit(input: TelemetryEventRequest): Promise<TelemetryAdmission> {
    const businessValidation = this.validateBusinessRules(input);
    if (businessValidation) {
      return businessValidation;
    }

    if (this.buffer.length >= BUFFER_CAPACITY) {
      throw new PipelineBufferFullError();
    }

    const tupleKey = tupleKeyFor(input);
    if (this.admittedTuples.has(tupleKey)) {
      return { status: "duplicate" };
    }

    const duplicate = await this.telemetryRepository.findTelemetryEventByTuple(
      input.device_id,
      input.boot_counter,
      input.seq,
    );
    if (duplicate) {
      return { status: "duplicate" };
    }

    if (this.isStale(input)) {
      return { status: "stale" };
    }

    this.admittedTuples.add(tupleKey);
    this.pendingCursors.set(input.pole_id, {
      bootCounter: input.boot_counter,
      seq: input.seq,
    });
    this.buffer.push({
      telemetryId: uuidv7(),
      input: Object.freeze({ ...input }),
      receivedAt: new Date(),
      tupleKey,
    });

    return { status: "accepted" };
  }

  subscribe(listener: TelemetryCompletionListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    clearInterval(this.timer);
  }

  private validateBusinessRules(
    input: TelemetryEventRequest,
  ): Extract<TelemetryAdmission, { status: "business_rejected" }> | undefined {
    const pole = this.polesById.get(input.pole_id);
    if (!pole) {
      return { status: "business_rejected", message: "Unknown pole_id" };
    }
    if (pole.deviceId !== input.device_id) {
      return {
        status: "business_rejected",
        message: "device_id does not match pole_id",
      };
    }
    return undefined;
  }

  private isStale(input: TelemetryEventRequest): boolean {
    const pending = this.pendingCursors.get(input.pole_id);
    const state = this.poleStateService.getPoleState(input.pole_id);
    const persistedCursor =
      state && state.lastBootCounter !== null && state.lastSeq !== null
        ? { bootCounter: state.lastBootCounter, seq: state.lastSeq }
        : undefined;
    const cursor = pending ?? persistedCursor;

    return cursor ? compareTuple(input, cursor) <= 0 : false;
  }

  private async drain(): Promise<void> {
    if (this.draining) {
      return;
    }

    this.draining = true;
    try {
      while (this.buffer.length > 0) {
        const queued = this.buffer.shift();
        if (queued) {
          await this.process(queued);
        }
      }
    } finally {
      this.draining = false;
    }
  }

  private async process(queued: QueuedTelemetry): Promise<void> {
    try {
      const stored = await this.telemetryRepository.insertTelemetryEvent({
        id: queued.telemetryId,
        deviceId: queued.input.device_id,
        poleId: queued.input.pole_id,
        event: queued.input.event,
        energized: queued.input.energized,
        deviceTs: new Date(queued.input.ts),
        bootCounter: queued.input.boot_counter,
        seq: queued.input.seq,
        batteryMv: queued.input.battery_mv,
        rssi: queued.input.rssi,
        firmware: queued.input.fw,
        receivedAt: queued.receivedAt,
      });
      if (!stored) {
        return;
      }

      try {
        await this.poleStateService.applyEvent({
          poleId: queued.input.pole_id,
          event: queued.input.event,
          bootCounter: queued.input.boot_counter,
          seq: queued.input.seq,
          receivedAt: queued.receivedAt,
          batteryMv: queued.input.battery_mv,
          rssi: queued.input.rssi,
          firmware: queued.input.fw,
        });
      } catch (error) {
        this.logger.error(
          {
            error,
            telemetryId: queued.telemetryId,
            poleId: queued.input.pole_id,
          },
          "Telemetry persisted but pole state update failed",
        );
        return;
      }

      const completion = Object.freeze({
        telemetryId: queued.telemetryId,
        deviceId: queued.input.device_id,
        poleId: queued.input.pole_id,
        bootCounter: queued.input.boot_counter,
        seq: queued.input.seq,
      });
      for (const listener of this.listeners) {
        listener(completion);
      }
    } catch (error) {
      this.logger.error(
        {
          error,
          telemetryId: queued.telemetryId,
          poleId: queued.input.pole_id,
        },
        "Telemetry pipeline processing failed",
      );
    } finally {
      this.admittedTuples.delete(queued.tupleKey);
      this.clearCompletedPendingCursor(queued);
    }
  }

  private clearCompletedPendingCursor(queued: QueuedTelemetry): void {
    const pending = this.pendingCursors.get(queued.input.pole_id);
    if (
      pending?.bootCounter === queued.input.boot_counter &&
      pending.seq === queued.input.seq
    ) {
      this.pendingCursors.delete(queued.input.pole_id);
    }
  }
}

function tupleKeyFor(input: TelemetryEventRequest): string {
  return `${input.device_id}\u0000${input.boot_counter}\u0000${input.seq}`;
}

function compareTuple(
  input: TelemetryEventRequest,
  cursor: StreamCursor,
): number {
  if (input.boot_counter !== cursor.bootCounter) {
    return input.boot_counter - cursor.bootCounter;
  }
  return input.seq - cursor.seq;
}

import { afterEach, describe, expect, it, vi } from "vitest";

import type { PoleState } from "../src/domain/pole-state/types.js";
import { EventPipeline } from "../src/infrastructure/event-pipeline.js";
import type { TelemetryRepository } from "../src/infrastructure/repositories/telemetry-repository.js";
import type { PoleStateService } from "../src/domain/pole-state/pole-state-service.js";

const input = {
  device_id: "DEV-001",
  pole_id: "P-001",
  event: "heartbeat" as const,
  energized: true,
  ts: "2026-08-05T12:00:00.000Z",
  boot_counter: 1,
  seq: 1,
};
const pipelines: EventPipeline[] = [];

describe("EventPipeline", () => {
  afterEach(() => {
    for (const pipeline of pipelines.splice(0)) {
      pipeline.dispose();
    }
  });

  it("admits ordered telemetry, persists it, updates state, and notifies listeners", async () => {
    const repository = {
      findTelemetryEventByTuple: vi.fn().mockResolvedValue(undefined),
      insertTelemetryEvent: vi.fn().mockResolvedValue({ id: "event-1" }),
    };
    const applyEvent = vi.fn().mockResolvedValue({});
    const state = createState(null, null);
    const pipeline = createPipeline(repository, {
      getPoleState: () => state,
      applyEvent,
    });
    const completed = vi.fn();
    pipeline.subscribe(completed);

    await expect(pipeline.admit(input)).resolves.toEqual({
      status: "accepted",
    });
    await waitFor(() => expect(applyEvent).toHaveBeenCalledOnce());

    expect(repository.insertTelemetryEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        deviceId: input.device_id,
        poleId: input.pole_id,
        bootCounter: 1,
        seq: 1,
      }),
    );
    expect(completed).toHaveBeenCalledWith(
      expect.objectContaining({ deviceId: input.device_id, seq: 1 }),
    );
  });

  it("rejects duplicate and stale tuples before admission while accepting a reboot", async () => {
    const repository = {
      findTelemetryEventByTuple: vi.fn().mockResolvedValue(undefined),
      insertTelemetryEvent: vi.fn().mockResolvedValue({ id: "event-1" }),
    };
    const pipeline = createPipeline(repository, {
      getPoleState: () => createState(3, 8),
      applyEvent: vi.fn(),
    });

    await expect(
      pipeline.admit({ ...input, boot_counter: 3, seq: 8 }),
    ).resolves.toEqual({
      status: "stale",
    });
    await expect(
      pipeline.admit({ ...input, boot_counter: 3, seq: 7 }),
    ).resolves.toEqual({
      status: "stale",
    });
    await expect(
      pipeline.admit({ ...input, boot_counter: 4, seq: 0 }),
    ).resolves.toEqual({
      status: "accepted",
    });

    repository.findTelemetryEventByTuple.mockResolvedValueOnce({
      id: "duplicate",
    });
    await expect(
      pipeline.admit({ ...input, boot_counter: 4, seq: 1 }),
    ).resolves.toEqual({
      status: "duplicate",
    });
  });

  it("rejects an unknown pole and mismatched device as business validation failures", async () => {
    const repository = {
      findTelemetryEventByTuple: vi.fn(),
      insertTelemetryEvent: vi.fn(),
    };
    const pipeline = createPipeline(repository, {
      getPoleState: () => undefined,
      applyEvent: vi.fn(),
    });

    await expect(
      pipeline.admit({ ...input, pole_id: "P-404" }),
    ).resolves.toEqual({
      status: "business_rejected",
      message: "Unknown pole_id",
    });
    await expect(
      pipeline.admit({ ...input, device_id: "OTHER" }),
    ).resolves.toEqual({
      status: "business_rejected",
      message: "device_id does not match pole_id",
    });
  });

  it("preserves admission ordering for queued events", async () => {
    const repository = {
      findTelemetryEventByTuple: vi.fn().mockResolvedValue(undefined),
      insertTelemetryEvent: vi.fn().mockResolvedValue({ id: "event" }),
    };
    const applyEvent = vi.fn().mockResolvedValue({});
    const pipeline = createPipeline(repository, {
      getPoleState: () => createState(null, null),
      applyEvent,
    });

    await pipeline.admit({ ...input, seq: 1 });
    await pipeline.admit({ ...input, seq: 2 });
    await pipeline.admit({ ...input, seq: 3 });
    await waitFor(() => expect(applyEvent).toHaveBeenCalledTimes(3));

    expect(applyEvent.mock.calls.map(([event]) => event.seq)).toEqual([
      1, 2, 3,
    ]);
  });

  it("retains only the latest queued cursor and clears it when the queue drains", async () => {
    const inserts: Array<() => void> = [];
    const repository = {
      findTelemetryEventByTuple: vi.fn().mockResolvedValue(undefined),
      insertTelemetryEvent: vi.fn(
        () =>
          new Promise((resolve) => {
            inserts.push(() => resolve({ id: "event" }));
          }),
      ),
    };
    let state = createState(null, null);
    const applyEvent = vi.fn().mockImplementation(async (event) => {
      state = createState(event.bootCounter, event.seq);
      return state;
    });
    const pipeline = createPipeline(repository, {
      getPoleState: () => state,
      applyEvent,
    });

    await pipeline.admit({ ...input, seq: 1 });
    await waitFor(() => expect(inserts).toHaveLength(1));
    await pipeline.admit({ ...input, seq: 2 });
    await pipeline.admit({ ...input, seq: 3 });

    inserts[0]!();
    await waitFor(() => expect(inserts).toHaveLength(2));
    expect(pendingCursorFor(pipeline)).toEqual({ bootCounter: 1, seq: 3 });

    inserts[1]!();
    await waitFor(() => expect(inserts).toHaveLength(3));
    expect(pendingCursorFor(pipeline)).toEqual({ bootCounter: 1, seq: 3 });

    inserts[2]!();
    await waitFor(() => expect(applyEvent).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(pendingCursorFor(pipeline)).toBeUndefined());
  });

  it("uses a fixed-capacity buffer and rejects overflow without dropping events", async () => {
    vi.useFakeTimers();
    const repository = {
      findTelemetryEventByTuple: vi.fn().mockResolvedValue(undefined),
      insertTelemetryEvent: vi.fn().mockResolvedValue({ id: "event" }),
    };
    const pipeline = createPipeline(repository, {
      getPoleState: () => createState(null, null),
      applyEvent: vi.fn(),
    });

    for (let seq = 0; seq < 8_192; seq += 1) {
      await expect(pipeline.admit({ ...input, seq })).resolves.toEqual({
        status: "accepted",
      });
    }

    await expect(pipeline.admit({ ...input, seq: 8_192 })).rejects.toThrow(
      "Telemetry pipeline buffer is full",
    );
    vi.useRealTimers();
  });
});

function createPipeline(
  repository: {
    findTelemetryEventByTuple: ReturnType<typeof vi.fn>;
    insertTelemetryEvent: ReturnType<typeof vi.fn>;
  },
  service: {
    getPoleState: () => PoleState | undefined;
    applyEvent: ReturnType<typeof vi.fn>;
  },
): EventPipeline {
  const pipeline = new EventPipeline(
    {
      poles: [
        {
          poleId: "P-001",
          deviceId: "DEV-001",
        },
      ],
    } as never,
    repository as unknown as TelemetryRepository,
    service as unknown as PoleStateService,
    { error: vi.fn() },
  );
  pipelines.push(pipeline);
  return pipeline;
}

function createState(
  lastBootCounter: number | null,
  lastSeq: number | null,
): PoleState {
  return {
    poleId: "P-001",
    energized: "UNKNOWN",
    lastHeartbeatAt: null,
    lastEventAt: null,
    lastBootCounter,
    lastSeq,
    firmwareVersion: null,
    deviceHealth: "HEALTHY",
    hasDevice: true,
    batteryMv: null,
    rssi: null,
    updatedAt: new Date(),
  };
}

async function waitFor(
  assertion: () => void,
  timeoutMs = 1_000,
): Promise<void> {
  const startedAt = Date.now();
  for (;;) {
    try {
      assertion();
      return;
    } catch (error) {
      if (Date.now() - startedAt >= timeoutMs) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
}

function pendingCursorFor(
  pipeline: EventPipeline,
): { bootCounter: number; seq: number } | undefined {
  return (
    pipeline as unknown as {
      pendingCursors: Map<string, { bootCounter: number; seq: number }>;
    }
  ).pendingCursors.get("P-001");
}

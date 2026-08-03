import { describe, expect, it, vi } from "vitest";

import { PoleStateService } from "../src/domain/pole-state/pole-state-service.js";
import type {
  PoleState,
  PoleStatePersistenceUpdate,
  PoleStateStore,
  ProcessedTelemetryEvent,
} from "../src/domain/pole-state/types.js";

const initialState: PoleState = {
  poleId: "P-001",
  energized: "UNKNOWN",
  lastHeartbeatAt: null,
  lastEventAt: null,
  lastBootCounter: null,
  lastSeq: null,
  firmwareVersion: null,
  deviceHealth: "HEALTHY",
  hasDevice: true,
  batteryMv: null,
  rssi: null,
  updatedAt: new Date("2026-08-05T10:00:00.000Z"),
};

describe("PoleStateService", () => {
  it("rebuilds an isolated cache from durable pole states", async () => {
    const store = new MemoryPoleStateStore([initialState]);
    const service = new PoleStateService(store);

    await service.rebuildCache();
    const state = service.getPoleState("P-001");

    expect(state).toEqual(initialState);
    expect(state).not.toBe(initialState);
    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(service.getPoleStates())).toBe(true);

    state?.updatedAt.setUTCFullYear(2030);
    expect(service.getPoleState("P-001")?.updatedAt).toEqual(
      initialState.updatedAt,
    );
  });

  it("updates heartbeat metadata without changing energized state or publishing", async () => {
    const store = new MemoryPoleStateStore([
      { ...initialState, energized: "LIVE" },
    ]);
    const service = new PoleStateService(store);
    const listener = vi.fn();
    service.subscribe(listener);
    await service.rebuildCache();

    const state = await service.applyEvent(event("heartbeat", 7));

    expect(state).toMatchObject({
      energized: "LIVE",
      lastBootCounter: 0,
      lastSeq: 7,
      firmwareVersion: "1.4.2",
      batteryMv: 3600,
      rssi: -70,
    });
    expect(state.lastHeartbeatAt).toEqual(event("heartbeat", 7).receivedAt);
    expect(listener).not.toHaveBeenCalled();
  });

  it("maps power_lost to DARK and publishes immutable state snapshots", async () => {
    const store = new MemoryPoleStateStore([
      { ...initialState, energized: "LIVE" },
    ]);
    const service = new PoleStateService(store);
    const listener = vi.fn();
    service.subscribe(listener);
    await service.rebuildCache();

    await service.applyEvent(event("power_lost", 8));

    expect(store.state("P-001")?.energized).toBe("DARK");
    expect(service.getPoleState("P-001")?.energized).toBe("DARK");
    expect(listener).toHaveBeenCalledOnce();
    expect(listener.mock.calls[0]?.[0]).toMatchObject({
      previousState: { energized: "LIVE" },
      currentState: { energized: "DARK" },
    });
    expect(Object.isFrozen(listener.mock.calls[0]?.[0].previousState)).toBe(
      true,
    );
  });

  it("maps power_restored and boot to LIVE, retaining the boot sequence", async () => {
    const store = new MemoryPoleStateStore([
      { ...initialState, energized: "DARK" },
    ]);
    const service = new PoleStateService(store);
    await service.rebuildCache();

    await service.applyEvent(event("power_restored", 9));
    const bootState = await service.applyEvent(event("boot", 1, 1));

    expect(bootState.energized).toBe("LIVE");
    expect(bootState.lastBootCounter).toBe(1);
    expect(bootState.lastSeq).toBe(1);
  });

  it("orders telemetry by boot counter and sequence", async () => {
    const store = new MemoryPoleStateStore([
      { ...initialState, energized: "LIVE" },
    ]);
    const service = new PoleStateService(store);
    await service.rebuildCache();

    await service.applyEvent(event("heartbeat", 9, 2));
    await service.applyEvent(event("power_lost", 8, 2));
    expect(service.getPoleState("P-001")?.energized).toBe("LIVE");

    await service.applyEvent(event("power_lost", 0, 3));
    expect(service.getPoleState("P-001")).toMatchObject({
      energized: "DARK",
      lastBootCounter: 3,
      lastSeq: 0,
    });

    await service.applyEvent(event("power_restored", 99, 2));
    expect(service.getPoleState("P-001")?.energized).toBe("DARK");
  });

  it("does not publish a duplicate transition when an event retains the same logical state", async () => {
    const store = new MemoryPoleStateStore([
      { ...initialState, energized: "LIVE" },
    ]);
    const service = new PoleStateService(store);
    const listener = vi.fn();
    service.subscribe(listener);
    await service.rebuildCache();

    await service.applyEvent(event("power_restored", 10));

    expect(listener).not.toHaveBeenCalled();
    expect(store.state("P-001")?.lastSeq).toBe(10);
  });

  it("keeps cache unchanged and publishes nothing when persistence fails", async () => {
    const store = new MemoryPoleStateStore([
      { ...initialState, energized: "LIVE" },
    ]);
    store.failUpdates = true;
    const service = new PoleStateService(store);
    const listener = vi.fn();
    service.subscribe(listener);
    await service.rebuildCache();

    await expect(service.applyEvent(event("power_lost", 11))).rejects.toThrow(
      "Persistence failed",
    );

    expect(service.getPoleState("P-001")?.energized).toBe("LIVE");
    expect(listener).not.toHaveBeenCalled();
  });

  it("does not change device health during event application", async () => {
    const store = new MemoryPoleStateStore([
      { ...initialState, deviceHealth: "DEGRADED" },
    ]);
    const service = new PoleStateService(store);
    await service.rebuildCache();

    const state = await service.applyEvent(event("heartbeat", 12));

    expect(state.deviceHealth).toBe("DEGRADED");
    expect(store.state("P-001")?.deviceHealth).toBe("DEGRADED");
  });

  it("provides a persist-first presumed-dark transition for future orchestration", async () => {
    const store = new MemoryPoleStateStore([
      { ...initialState, energized: "LIVE" },
    ]);
    const service = new PoleStateService(store);
    const listener = vi.fn();
    service.subscribe(listener);
    await service.rebuildCache();

    await service.markPresumedDark(
      "P-001",
      new Date("2026-08-05T10:35:00.000Z"),
    );

    expect(store.state("P-001")?.energized).toBe("PRESUMED_DARK");
    expect(service.getPoleState("P-001")?.energized).toBe("PRESUMED_DARK");
    expect(listener).toHaveBeenCalledOnce();
  });
});

class MemoryPoleStateStore implements PoleStateStore {
  failUpdates = false;
  private readonly states = new Map<string, PoleState>();

  constructor(states: PoleState[]) {
    for (const state of states) {
      this.states.set(state.poleId, cloneState(state));
    }
  }

  async listPoleStates(): Promise<ReadonlyArray<PoleState>> {
    return [...this.states.values()].map(cloneState);
  }

  async updatePoleState(
    poleId: string,
    update: PoleStatePersistenceUpdate,
  ): Promise<unknown | undefined> {
    if (this.failUpdates) {
      throw new Error("Persistence failed");
    }
    const current = this.states.get(poleId);
    if (!current) {
      return undefined;
    }
    this.states.set(poleId, { ...current, ...update });
    return this.states.get(poleId);
  }

  state(poleId: string): PoleState | undefined {
    const state = this.states.get(poleId);
    return state ? cloneState(state) : undefined;
  }
}

function event(
  eventType: ProcessedTelemetryEvent["event"],
  seq: number,
  bootCounter = 0,
): ProcessedTelemetryEvent {
  return {
    poleId: "P-001",
    event: eventType,
    bootCounter,
    seq,
    receivedAt: new Date("2026-08-05T10:05:00.000Z"),
    batteryMv: 3600,
    rssi: -70,
    firmware: "1.4.2",
  };
}

function cloneState(state: PoleState): PoleState {
  return {
    ...state,
    lastHeartbeatAt: state.lastHeartbeatAt
      ? new Date(state.lastHeartbeatAt)
      : null,
    lastEventAt: state.lastEventAt ? new Date(state.lastEventAt) : null,
    updatedAt: new Date(state.updatedAt),
  };
}

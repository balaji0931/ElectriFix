import type { EnergizedState } from "../contracts.js";
import type {
  PoleState,
  PoleStatePersistenceUpdate,
  PoleStateStore,
  PoleStateTransition,
  PoleStateTransitionListener,
  ProcessedTelemetryEvent,
} from "./types.js";

/** Owns the current pole-state cache and synchronizes it with durable state. */
export class PoleStateService {
  private readonly cache = new Map<string, PoleState>();
  private readonly listeners = new Set<PoleStateTransitionListener>();

  constructor(private readonly store: PoleStateStore) {}

  async rebuildCache(): Promise<void> {
    const persistedStates = await this.store.listPoleStates();
    const rebuilt = new Map<string, PoleState>();

    for (const persistedState of persistedStates) {
      if (rebuilt.has(persistedState.poleId)) {
        throw new Error(
          `Pole state cache cannot contain duplicate pole ${persistedState.poleId}`,
        );
      }
      rebuilt.set(persistedState.poleId, clonePoleState(persistedState));
    }

    this.cache.clear();
    for (const [poleId, state] of rebuilt) {
      this.cache.set(poleId, state);
    }
  }

  getPoleState(poleId: string): PoleState | undefined {
    const state = this.cache.get(poleId);
    return state ? clonePoleState(state) : undefined;
  }

  getPoleStates(): ReadonlyArray<PoleState> {
    return Object.freeze(
      [...this.cache.values()].map((state) => clonePoleState(state)),
    );
  }

  subscribe(listener: PoleStateTransitionListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async applyEvent(event: ProcessedTelemetryEvent): Promise<PoleState> {
    const current = this.cache.get(event.poleId);
    if (!current) {
      throw new Error(`Pole state is not loaded for pole ${event.poleId}`);
    }

    const next = applyEventToState(current, event);
    const update = toPersistenceUpdate(next);

    const persisted = await this.store.updatePoleState(event.poleId, update);
    if (persisted === undefined) {
      throw new Error(`Pole state does not exist for pole ${event.poleId}`);
    }

    this.cache.set(event.poleId, next);

    if (current.energized !== next.energized) {
      this.publish({
        previousState: clonePoleState(current),
        currentState: clonePoleState(next),
      });
    }

    return clonePoleState(next);
  }

  private publish(transition: PoleStateTransition): void {
    for (const listener of this.listeners) {
      listener(transition);
    }
  }
}

function applyEventToState(
  current: PoleState,
  event: ProcessedTelemetryEvent,
): PoleState {
  const energized = energizedForEvent(current.energized, event.event);
  const heartbeatAt =
    event.event === "heartbeat" ? event.receivedAt : current.lastHeartbeatAt;

  return Object.freeze({
    ...current,
    energized,
    lastHeartbeatAt: cloneDate(heartbeatAt),
    lastEventAt: cloneDate(event.receivedAt),
    lastSeq: event.seq,
    firmwareVersion: event.firmware ?? current.firmwareVersion,
    batteryMv: event.batteryMv ?? current.batteryMv,
    rssi: event.rssi ?? current.rssi,
    updatedAt: cloneRequiredDate(event.receivedAt),
  });
}

function energizedForEvent(
  current: EnergizedState,
  event: ProcessedTelemetryEvent["event"],
): EnergizedState {
  switch (event) {
    case "power_lost":
      return "DARK";
    case "power_restored":
    case "boot":
      return "LIVE";
    case "heartbeat":
      return current;
  }
}

function toPersistenceUpdate(state: PoleState): PoleStatePersistenceUpdate {
  return {
    energized: state.energized,
    lastHeartbeatAt: cloneDate(state.lastHeartbeatAt),
    lastEventAt: cloneDate(state.lastEventAt),
    lastSeq: state.lastSeq,
    firmwareVersion: state.firmwareVersion,
    batteryMv: state.batteryMv,
    rssi: state.rssi,
    updatedAt: cloneRequiredDate(state.updatedAt),
  };
}

function clonePoleState(state: PoleState): PoleState {
  return Object.freeze({
    ...state,
    lastHeartbeatAt: cloneDate(state.lastHeartbeatAt),
    lastEventAt: cloneDate(state.lastEventAt),
    updatedAt: cloneRequiredDate(state.updatedAt),
  });
}

function cloneDate(value: Date | null): Date | null {
  return value === null ? null : new Date(value.getTime());
}

function cloneRequiredDate(value: Date): Date {
  return new Date(value.getTime());
}

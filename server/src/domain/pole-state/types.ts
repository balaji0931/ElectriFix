import type {
  DeviceHealthStatus,
  EnergizedState,
  TelemetryEventType,
} from "../contracts.js";

export interface PoleState {
  readonly poleId: string;
  readonly energized: EnergizedState;
  readonly lastHeartbeatAt: Date | null;
  readonly lastEventAt: Date | null;
  readonly lastBootCounter: number | null;
  readonly lastSeq: number | null;
  readonly firmwareVersion: string | null;
  readonly deviceHealth: DeviceHealthStatus;
  readonly hasDevice: boolean;
  readonly batteryMv: number | null;
  readonly rssi: number | null;
  readonly updatedAt: Date;
}

export interface PoleStatePersistenceUpdate {
  energized?: EnergizedState;
  lastHeartbeatAt?: Date | null;
  lastEventAt?: Date | null;
  lastBootCounter?: number | null;
  lastSeq?: number | null;
  firmwareVersion?: string | null;
  batteryMv?: number | null;
  rssi?: number | null;
  updatedAt?: Date;
}

export interface PoleStateStore {
  listPoleStates(): Promise<ReadonlyArray<PoleState>>;
  updatePoleState(
    poleId: string,
    update: PoleStatePersistenceUpdate,
  ): Promise<unknown | undefined>;
}

export interface ProcessedTelemetryEvent {
  readonly poleId: string;
  readonly event: TelemetryEventType;
  readonly bootCounter: number;
  readonly seq: number;
  readonly receivedAt: Date;
  readonly batteryMv?: number;
  readonly rssi?: number;
  readonly firmware?: string;
}

export interface PoleStateTransition {
  readonly previousState: PoleState;
  readonly currentState: PoleState;
}

export type PoleStateTransitionListener = (
  transition: PoleStateTransition,
) => void;

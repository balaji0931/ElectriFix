/**
 * Canonical framework-independent vocabulary for the ElectriFix domain.
 * Runtime services and presentation code must import these definitions rather
 * than recreating equivalent enums or shapes.
 */

export const telemetryEventTypes = [
  "heartbeat",
  "power_lost",
  "power_restored",
  "boot",
] as const;
export type TelemetryEventType = (typeof telemetryEventTypes)[number];

export const energizedStates = [
  "LIVE",
  "DARK",
  "PRESUMED_DARK",
  "UNKNOWN",
] as const;
export type EnergizedState = (typeof energizedStates)[number];

export const deviceHealthStatuses = [
  "NO_DEVICE",
  "HEALTHY",
  "OFFLINE",
  "DEGRADED",
] as const;
export type DeviceHealthStatus = (typeof deviceHealthStatuses)[number];

export const topologySources = ["RECORDED", "INFERRED", "FALLBACK"] as const;
export type TopologySource = (typeof topologySources)[number];

export const confidenceLevels = ["HIGH", "MEDIUM", "LOW"] as const;
export type ConfidenceLevel = (typeof confidenceLevels)[number];

export const faultTypes = ["span", "dt", "feeder"] as const;
export type FaultType = (typeof faultTypes)[number];

export const faultStatuses = ["active", "resolved", "merged"] as const;
export type FaultStatus = (typeof faultStatuses)[number];

export const ticketStatuses = [
  "detected",
  "acknowledged",
  "crew_assigned",
  "resolved",
  "verified",
  "closed",
] as const;
export type TicketStatus = (typeof ticketStatuses)[number];

export const scheduledOutageScopes = ["feeder", "dt"] as const;
export type ScheduledOutageScope = (typeof scheduledOutageScopes)[number];

export const simulatorNoiseTypes = [
  "dead_sensor",
  "duplicate_telemetry",
  "stale_retry",
  "out_of_order",
] as const;
export type SimulatorNoiseType = (typeof simulatorNoiseTypes)[number];

export const webSocketMessageTypes = [
  "fault.created",
  "fault.updated",
  "ticket.created",
  "ticket.updated",
  "pole.state_changed",
  "simulation.started",
  "simulation.completed",
] as const;
export type WebSocketMessageType = (typeof webSocketMessageTypes)[number];

export const simulationCompletionResults = [
  "fault_detected",
  "repair_verified",
] as const;
export type SimulationCompletionResult =
  (typeof simulationCompletionResults)[number];

export const apiErrorCodes = [
  "BAD_REQUEST",
  "NOT_FOUND",
  "CONFLICT",
  "DUPLICATE_SIMULATION",
  "VALIDATION_ERROR",
  "INTERNAL_ERROR",
  "SERVICE_UNAVAILABLE",
  "PIPELINE_BUFFER_FULL",
] as const;
export type ApiErrorCode = (typeof apiErrorCodes)[number];

export interface Coordinates {
  lat: number;
  lon: number;
}

export interface TopologyRoot {
  dt_id: string;
  coordinates: Coordinates;
}

export interface TopologyNode {
  pole_id: string;
  coordinates: Coordinates;
}

export interface TopologyEdge {
  from_pole_id: string;
  to_pole_id: string;
}

/** A transportable topology description, not a runtime graph implementation. */
export interface Topology {
  source: TopologySource;
  root: TopologyRoot;
  nodes: TopologyNode[];
  edges: TopologyEdge[];
}

export interface ConfidenceReason {
  factor: string;
  positive: boolean;
  detail: string;
}

/**
 * The persisted JSONB and API evidence contract. Boundary poles are null when
 * a candidate has no meaningful pole-to-pole span, such as feeder or DT faults.
 */
export interface FaultEvidence {
  last_live_pole: string | null;
  first_dark_pole: string | null;
  fault_span: [string, string] | null;
  affected_poles: string[];
  affected_pole_count: number;
  topology_source: TopologySource;
  confidence_level: ConfidenceLevel;
  confidence_reasons: ConfidenceReason[];
  coordinates: Coordinates;
  pincode: string | null;
  suppressed_sensors: string[];
}

export interface FaultCandidate {
  fault_type: FaultType;
  feeder_id: string;
  dt_id: string;
  span_pole_a: string | null;
  span_pole_b: string | null;
  coordinates: Coordinates;
  pincode: string | null;
  affected_pole_count: number;
  confidence_level: ConfidenceLevel;
  topology_source: TopologySource;
  evidence: FaultEvidence;
}

export interface PoleStateSnapshot {
  pole_id: string;
  energized: EnergizedState;
  device_health: DeviceHealthStatus;
  has_device: boolean;
  last_heartbeat_at: string | null;
}

export interface WebSocketMessage<TPayload = unknown> {
  type: WebSocketMessageType;
  payload: TPayload;
  timestamp: string;
  event_id: string;
}

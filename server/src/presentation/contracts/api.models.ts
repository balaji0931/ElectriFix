import type {
  ApiErrorCode,
  ConfidenceLevel,
  DeviceHealthStatus,
  EnergizedState,
  FaultEvidence,
  FaultStatus,
  FaultType,
  ScheduledOutageScope,
  SimulationCompletionResult,
  TicketStatus,
  TopologySource,
  WebSocketMessage,
} from "../../domain/contracts.js";

export interface ApiErrorDetail {
  field: string;
  message: string;
  value: unknown;
}

export interface ApiErrorResponse {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: ApiErrorDetail[];
    timestamp: string;
  };
}

export interface PaginationResponse {
  next_cursor: string | null;
  has_more: boolean;
  total_count?: number;
}

export interface FaultResponse {
  fault_id: string;
  dt_id: string;
  feeder_id: string;
  fault_type: FaultType;
  status: FaultStatus;
  span_pole_a: string | null;
  span_pole_b: string | null;
  lat: number;
  lon: number;
  pincode: string | null;
  affected_pole_count: number;
  confidence_level: ConfidenceLevel;
  topology_source: TopologySource;
  ai_summary: string | null;
  detected_at: string;
  resolved_at: string | null;
  evidence: FaultEvidence;
}

export interface FaultSummaryResponse {
  fault_id: string;
  fault_type: FaultType;
  dt_id: string;
  lat: number;
  lon: number;
  pincode: string | null;
  affected_pole_count: number;
  confidence_level: ConfidenceLevel;
  topology_source: TopologySource;
}

export interface TicketResponse {
  ticket_id: string;
  fault_id: string;
  status: TicketStatus;
  assigned_crew: string | null;
  operator_notes: string | null;
  rejection_count: number;
  rejection_reason: string | null;
  detected_at: string;
  acknowledged_at: string | null;
  crew_assigned_at: string | null;
  resolved_at: string | null;
  verified_at: string | null;
  closed_at: string | null;
  fault: FaultSummaryResponse;
}

export interface PoleStateResponse {
  pole_id: string;
  lat: number;
  lon: number;
  dt_id: string;
  feeder_id: string;
  energized: EnergizedState;
  has_device: boolean;
  device_health: DeviceHealthStatus;
  last_heartbeat_at: string | null;
  firmware_version: string | null;
}

export interface ScheduledOutageResponse {
  outage_id: string;
  scope: ScheduledOutageScope;
  target_id: string;
  scheduled_start: string;
  scheduled_end: string;
  reason: string | null;
}

export interface FaultCreatedMessage extends WebSocketMessage<FaultSummaryResponse> {
  type: "fault.created";
}

export interface FaultUpdatedMessage extends WebSocketMessage<{
  fault_id: string;
  status: FaultStatus;
  affected_pole_count: number;
  ai_summary: string | null;
  resolved_at: string | null;
}> {
  type: "fault.updated";
}

export interface TicketCreatedMessage extends WebSocketMessage<{
  ticket_id: string;
  fault_id: string;
  status: TicketStatus;
  fault_summary: FaultSummaryResponse;
}> {
  type: "ticket.created";
}

export interface TicketUpdatedMessage extends WebSocketMessage<{
  ticket_id: string;
  status: TicketStatus;
  previous_status: TicketStatus;
  rejection_count: number;
  rejection_reason: string | null;
  updated_at: string;
}> {
  type: "ticket.updated";
}

export interface PoleStateChangedMessage extends WebSocketMessage<{
  changes: Array<{
    pole_id: string;
    previous_state: EnergizedState;
    new_state: EnergizedState;
    dt_id: string;
  }>;
}> {
  type: "pole.state_changed";
}

export interface SimulationStartedMessage extends WebSocketMessage<{
  simulation_id: string;
  fault_type: FaultType;
  target_id: string;
}> {
  type: "simulation.started";
}

export interface SimulationCompletedMessage extends WebSocketMessage<{
  simulation_id: string;
  result: SimulationCompletionResult;
  fault_id: string | null;
  ticket_id: string | null;
  duration_ms: number;
}> {
  type: "simulation.completed";
}

export type ApiWebSocketMessage =
  | FaultCreatedMessage
  | FaultUpdatedMessage
  | TicketCreatedMessage
  | TicketUpdatedMessage
  | PoleStateChangedMessage
  | SimulationStartedMessage
  | SimulationCompletedMessage;

export type ConfidenceLevel = "HIGH" | "MEDIUM" | "LOW";
export type TopologySource = "RECORDED" | "INFERRED" | "FALLBACK";
export type FaultType = "span" | "dt" | "feeder";
export type FaultStatus = "active" | "resolved" | "merged";
export type TicketStatus =
  | "detected"
  | "acknowledged"
  | "crew_assigned"
  | "resolved"
  | "verified"
  | "closed";
export type EnergizedState = "LIVE" | "DARK" | "PRESUMED_DARK" | "UNKNOWN";

export interface ConfidenceReason {
  factor: string;
  positive: boolean;
  detail: string;
}

export interface FaultEvidence {
  last_live_pole: string | null;
  first_dark_pole: string | null;
  fault_span: [string, string] | null;
  affected_poles: string[];
  affected_pole_count: number;
  topology_source: TopologySource;
  confidence_level: ConfidenceLevel;
  confidence_reasons: ConfidenceReason[];
  coordinates: { lat: number; lon: number };
  pincode: string | null;
  suppressed_sensors: string[];
}

export interface FaultSummary {
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

export interface Fault extends FaultSummary {
  feeder_id: string;
  status: FaultStatus;
  span_pole_a: string | null;
  span_pole_b: string | null;
  ai_summary: string | null;
  detected_at: string;
  resolved_at: string | null;
  evidence: FaultEvidence;
}

export interface Ticket {
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
  updated_at?: string;
  fault: FaultSummary | Fault;
}

export interface PoleState {
  pole_id: string;
  lat: number;
  lon: number;
  dt_id: string;
  feeder_id: string;
  energized: EnergizedState;
  has_device: boolean;
  device_health: "NO_DEVICE" | "HEALTHY" | "OFFLINE" | "DEGRADED";
  last_heartbeat_at: string | null;
  firmware_version: string | null;
}

export interface DistributionTransformer {
  dt_id: string;
  feeder_id: string;
  lat: number;
  lon: number;
  capacity_kva: number;
  households_served: number;
  has_recorded_topology: boolean;
  pole_count: number;
}

export interface NetworkTopology {
  dt_id: string;
  source: TopologySource;
  nodes: Array<{ pole_id: string; lat: number; lon: number }>;
  edges: Array<{ parent: string; child: string }>;
}

export interface DashboardSummary {
  active_faults: number;
  open_tickets: number;
  tickets_by_status: Record<string, number>;
  network_status: {
    total_poles: number;
    live_poles: number;
    dark_poles: number;
    presumed_dark_poles: number;
    unknown_poles: number;
    dead_sensors: number;
    active_outages: number;
  };
  recent_faults: FaultSummary[];
  timestamp: string;
}

export interface SimulationScenarios {
  fault_types: FaultType[];
  noise_types: Array<
    "dead_sensor" | "duplicate_telemetry" | "stale_retry" | "out_of_order"
  >;
  targets: {
    feeders: Array<{ feeder_id: string; dt_count: number; pole_count: number }>;
    dts: Array<{
      dt_id: string;
      feeder_id: string;
      pole_count: number;
      has_recorded_topology: boolean;
    }>;
  };
}

export interface SimulationReceipt {
  simulation_id: string;
  status: "running";
  fault_id?: string;
  started_at: string;
}

export interface ApiErrorBody {
  error: { code: string; message: string; timestamp?: string };
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

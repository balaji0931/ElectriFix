import type { ProductPolicies } from "../config/policies.js";
import type { FaultEvidence } from "../domain/contracts.js";
import type { PoleState } from "../domain/pole-state/types.js";
import type { StartupSnapshot } from "../infrastructure/db/bootstrap.js";
import type {
  FaultPersistenceModel,
  TicketPersistenceModel,
  TicketWithFault,
} from "../infrastructure/repositories/ticket-repository.js";

const iso = (value: Date | null) => value?.toISOString() ?? null;

export function faultResponse(fault: FaultPersistenceModel) {
  return {
    fault_id: fault.faultId,
    dt_id: fault.dtId,
    feeder_id: fault.feederId,
    fault_type: fault.faultType,
    status: fault.status,
    span_pole_a: fault.spanPoleA,
    span_pole_b: fault.spanPoleB,
    lat: fault.lat,
    lon: fault.lon,
    pincode: fault.pincode,
    affected_pole_count: fault.affectedPoleCount,
    confidence_level: fault.confidenceLevel,
    topology_source: fault.topologySource,
    ai_summary: fault.aiSummary,
    detected_at: fault.detectedAt.toISOString(),
    resolved_at: iso(fault.resolvedAt),
    evidence: fault.evidence as unknown as FaultEvidence,
  };
}

export function faultSummary(fault: FaultPersistenceModel) {
  return {
    fault_id: fault.faultId,
    fault_type: fault.faultType,
    dt_id: fault.dtId,
    lat: fault.lat,
    lon: fault.lon,
    pincode: fault.pincode,
    affected_pole_count: fault.affectedPoleCount,
    confidence_level: fault.confidenceLevel,
    topology_source: fault.topologySource,
  };
}

export function ticketResponse(record: TicketWithFault, detail = false) {
  const ticket = ticketFields(record.ticket);
  return {
    ...ticket,
    fault: detail ? faultResponse(record.fault) : faultSummary(record.fault),
  };
}

export function ticketActionResponse(ticket: TicketPersistenceModel) {
  return ticketFields(ticket);
}

function ticketFields(ticket: TicketPersistenceModel) {
  return {
    ticket_id: ticket.ticketId,
    fault_id: ticket.faultId,
    status: ticket.status,
    assigned_crew: ticket.assignedCrew,
    operator_notes: ticket.operatorNotes,
    rejection_count: ticket.rejectionCount,
    rejection_reason: ticket.rejectionReason,
    detected_at: ticket.detectedAt.toISOString(),
    acknowledged_at: iso(ticket.acknowledgedAt),
    crew_assigned_at: iso(ticket.crewAssignedAt),
    resolved_at: iso(ticket.resolvedAt),
    verified_at: iso(ticket.verifiedAt),
    closed_at: iso(ticket.closedAt),
    updated_at: ticket.updatedAt.toISOString(),
  };
}

export function poleStateResponse(
  pole: StartupSnapshot["poles"][number],
  state: PoleState,
) {
  return {
    pole_id: pole.poleId,
    lat: pole.lat,
    lon: pole.lon,
    dt_id: pole.dtId,
    feeder_id: pole.feederId,
    energized: state.energized,
    has_device: state.hasDevice,
    device_health: state.deviceHealth,
    last_heartbeat_at: iso(state.lastHeartbeatAt),
    firmware_version: state.firmwareVersion,
  };
}

export function configResponse(policies: ProductPolicies) {
  return {
    policies: {
      HEARTBEAT_INTERVAL: {
        value: policies.heartbeatIntervalMinutes,
        unit: "minutes",
      },
      HEARTBEAT_TIMEOUT_MULTIPLIER: {
        value: policies.heartbeatTimeoutMultiplier,
        unit: "count",
      },
      DEBOUNCE_DURATION: {
        value: policies.debounceDurationMinutes,
        unit: "minutes",
      },
      OUTAGE_TOLERANCE_MINUTES: {
        value: policies.outageToleranceMinutes,
        unit: "minutes",
      },
      VERIFICATION_THRESHOLD: {
        value: policies.verificationThreshold,
        unit: "fraction",
      },
      FEEDER_DARK_THRESHOLD: {
        value: policies.feederDarkThreshold,
        unit: "fraction",
      },
      STALE_HEARTBEAT_MINUTES: {
        value: policies.staleHeartbeatMinutes,
        unit: "minutes",
      },
      SENSOR_GAP_THRESHOLD: {
        value: policies.sensorGapThreshold,
        unit: "fraction",
      },
    },
  };
}

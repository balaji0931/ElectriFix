import { describe, expect, it } from "vitest";

import {
  apiErrorCodes,
  deviceHealthStatuses,
  energizedStates,
  faultStatuses,
  faultTypes,
  scheduledOutageScopes,
  simulationCompletionResults,
  simulatorNoiseTypes,
  telemetryEventTypes,
  ticketStatuses,
  topologySources,
  type FaultEvidence,
} from "../src/domain/contracts.js";
import {
  assignTicketRequestSchema,
  telemetryEventSchema,
  ticketActionRequestSchema,
} from "../src/presentation/contracts/api.schemas.js";

describe("shared domain contracts", () => {
  it("defines each documented enum exactly once with its approved values", () => {
    expect(telemetryEventTypes).toEqual([
      "heartbeat",
      "power_lost",
      "power_restored",
      "boot",
    ]);
    expect(energizedStates).toEqual([
      "LIVE",
      "DARK",
      "PRESUMED_DARK",
      "UNKNOWN",
    ]);
    expect(deviceHealthStatuses).toEqual([
      "NO_DEVICE",
      "HEALTHY",
      "OFFLINE",
      "DEGRADED",
    ]);
    expect(topologySources).toEqual(["RECORDED", "INFERRED", "FALLBACK"]);
    expect(faultTypes).toEqual(["span", "dt", "feeder"]);
    expect(faultStatuses).toEqual(["active", "resolved", "merged"]);
    expect(ticketStatuses).toEqual([
      "detected",
      "acknowledged",
      "crew_assigned",
      "resolved",
      "verified",
      "closed",
    ]);
    expect(scheduledOutageScopes).toEqual(["feeder", "dt"]);
    expect(simulatorNoiseTypes).toEqual([
      "dead_sensor",
      "duplicate_telemetry",
      "stale_retry",
      "out_of_order",
    ]);
    expect(simulationCompletionResults).toEqual([
      "fault_detected",
      "repair_verified",
    ]);
    expect(apiErrorCodes).toEqual([
      "BAD_REQUEST",
      "NOT_FOUND",
      "CONFLICT",
      "DUPLICATE_SIMULATION",
      "VALIDATION_ERROR",
      "INTERNAL_ERROR",
      "SERVICE_UNAVAILABLE",
    ]);
  });

  it("represents a non-span fault with nullable boundary evidence", () => {
    const evidence: FaultEvidence = {
      last_live_pole: null,
      first_dark_pole: null,
      fault_span: null,
      affected_poles: ["P-001"],
      affected_pole_count: 1,
      topology_source: "FALLBACK",
      confidence_level: "LOW",
      confidence_reasons: [],
      coordinates: { lat: 12.9716, lon: 77.5946 },
      pincode: null,
      suppressed_sensors: [],
    };

    expect(evidence.last_live_pole).toBeNull();
    expect(evidence.first_dark_pole).toBeNull();
  });

  it("accepts only the documented telemetry field names", () => {
    expect(
      telemetryEventSchema.safeParse({
        device_id: "DEV-001",
        pole_id: "P-001",
        event: "heartbeat",
        energized: true,
        ts: "2026-08-05T00:00:00Z",
        seq: 0,
        battery_mv: 3600,
        rssi: -72,
        fw: "1.4.2",
      }).success,
    ).toBe(true);
  });

  it("uses the documented ticket assignment and action request shapes", () => {
    expect(
      assignTicketRequestSchema.safeParse({
        assigned_crew: "crew-01",
        operator_notes: "Dispatched",
      }).success,
    ).toBe(true);
    expect(
      ticketActionRequestSchema.safeParse({ operator_notes: "Acknowledged" })
        .success,
    ).toBe(true);
  });
});

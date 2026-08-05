import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createApp } from "../src/presentation/app.js";
import { TicketNotFoundError } from "../src/application/manage-ticket.js";
import { TicketLifecycleError } from "../src/domain/ticket/ticket-lifecycle.js";

const now = new Date("2026-08-05T12:00:00.000Z");
const fault = {
  faultId: "018f8acb-0000-7000-8000-000000000001",
  dtId: "D-1",
  feederId: "F-1",
  faultType: "dt",
  status: "active",
  spanPoleA: null,
  spanPoleB: null,
  lat: 12.9,
  lon: 77.5,
  pincode: "560001",
  affectedPoleCount: 2,
  confidenceLevel: "LOW",
  topologySource: "FALLBACK",
  evidence: { affected_poles: ["P-1", "P-2"] },
  aiSummary: null,
  detectedAt: now,
  resolvedAt: null,
  createdAt: now,
  updatedAt: now,
};
const ticket = {
  ticketId: "018f8acb-0000-7000-8000-000000000002",
  faultId: fault.faultId,
  status: "detected",
  assignedCrew: null,
  operatorNotes: null,
  rejectionCount: 0,
  rejectionReason: null,
  detectedAt: now,
  acknowledgedAt: null,
  crewAssignedAt: null,
  resolvedAt: null,
  verifiedAt: null,
  closedAt: null,
  createdAt: now,
  updatedAt: now,
};

function app() {
  const dashboardData = {
    listFaults: vi.fn().mockResolvedValue([fault]),
    findFault: vi.fn().mockResolvedValue(fault),
    listTickets: vi.fn().mockResolvedValue([{ ticket, fault }]),
    findTicket: vi.fn().mockResolvedValue({ ticket, fault }),
    listOutages: vi.fn().mockResolvedValue([
      {
        outageId: "SO-1",
        scope: "dt",
        targetId: "D-1",
        scheduledStart: new Date(now.getTime() - 1),
        scheduledEnd: new Date(now.getTime() + 1),
        reason: "maintenance",
      },
    ]),
    summary: vi.fn().mockResolvedValue({
      activeFaults: 1,
      openTickets: 1,
      ticketsByStatus: {
        detected: 1,
        acknowledged: 0,
        crew_assigned: 0,
        resolved: 0,
        verified: 0,
      },
      networkStatus: {
        totalPoles: 2,
        livePoles: 1,
        darkPoles: 1,
        presumedDarkPoles: 0,
        unknownPoles: 0,
        deadSensors: 0,
        activeOutages: 1,
      },
      recentFaults: [fault],
      timestamp: now,
    }),
  };
  const pole = {
    poleId: "P-1",
    lat: 12.9,
    lon: 77.5,
    dtId: "D-1",
    feederId: "F-1",
    seqOnLine: 1,
    parentPoleId: null,
    pincode: "560001",
    deviceId: "DEV-1",
    poleType: "line",
    createdAt: now,
  };
  const state = {
    poleId: "P-1",
    energized: "LIVE",
    hasDevice: true,
    deviceHealth: "HEALTHY",
    lastHeartbeatAt: now,
    firmwareVersion: "1.4",
    lastEventAt: now,
    lastBootCounter: 1,
    lastSeq: 1,
    batteryMv: null,
    rssi: null,
    updatedAt: now,
  };
  const networkData = {
    poles: () => [pole],
    distributionTransformers: () => [
      {
        dtId: "D-1",
        feederId: "F-1",
        lat: 12.9,
        lon: 77.5,
        capacityKva: 100,
        householdsServed: 10,
        hasRecordedTopology: false,
      },
    ],
    feeders: () => [{ feederId: "F-1", substationId: "S-1", name: "Feeder" }],
    poleStates: () => [state],
    poleState: () => state,
    topology: () => ({
      source: "FALLBACK",
      root: () => ({
        kind: "DT",
        dtId: "D-1",
        coordinates: { lat: 12.9, lon: 77.5 },
      }),
      descendants: () => [],
      parent: () => null,
    }),
  };
  const manageTicket = {
    acknowledge: vi.fn().mockResolvedValue({
      ...ticket,
      status: "acknowledged",
      acknowledgedAt: now,
    }),
    assign: vi.fn().mockResolvedValue({
      ...ticket,
      status: "crew_assigned",
      assignedCrew: "Crew-1",
      crewAssignedAt: now,
    }),
    resolve: vi.fn().mockResolvedValue({
      ...ticket,
      status: "crew_assigned",
      rejectionCount: 1,
      rejectionReason: "Not restored",
    }),
  };
  return {
    server: createApp({
      checkDatabase: vi.fn(),
      startedAt: now.getTime(),
      version: "test",
      ingestTelemetry: { ingest: vi.fn(), ingestBatch: vi.fn() } as never,
      api: {
        dashboardData: dashboardData as never,
        networkData: networkData as never,
        manageTicket: manageTicket as never,
        policies: {
          heartbeatIntervalMinutes: 15,
          heartbeatTimeoutMultiplier: 2,
          debounceDurationMinutes: 30,
          outageToleranceMinutes: 40,
          verificationThreshold: 0.8,
          feederDarkThreshold: 0.8,
          staleHeartbeatMinutes: 20,
          sensorGapThreshold: 0.3,
        },
      },
    }),
    manageTicket,
  };
}

describe("Phase 13 REST API", () => {
  it("serves documented read endpoints and config serialization", async () => {
    const { server } = app();
    for (const path of [
      "/api/faults",
      `/api/faults/${fault.faultId}`,
      "/api/tickets",
      `/api/tickets/${ticket.ticketId}`,
      "/api/poles/states",
      "/api/poles/states/P-1",
      "/api/network/poles",
      "/api/network/dts",
      "/api/network/feeders",
      "/api/network/topology/D-1",
      "/api/scheduled-outages",
      "/api/dashboard/summary",
    ])
      await request(server).get(path).expect(200);
    const config = await request(server).get("/api/config").expect(200);
    expect(config.body.policies.HEARTBEAT_INTERVAL).toEqual({
      value: 15,
      unit: "minutes",
    });
    expect((await request(server).get("/api/faults?limit=0")).status).toBe(400);
  });

  it("delegates ticket commands and maps predictable errors", async () => {
    const { server, manageTicket } = app();
    await request(server)
      .patch(`/api/tickets/${ticket.ticketId}/acknowledge`)
      .send({})
      .expect(200);
    await request(server)
      .patch(`/api/tickets/${ticket.ticketId}/assign`)
      .send({ assigned_crew: "Crew-1" })
      .expect(200);
    await request(server)
      .patch(`/api/tickets/${ticket.ticketId}/resolve`)
      .send({})
      .expect(200);
    expect(manageTicket.acknowledge).toHaveBeenCalledOnce();
    manageTicket.acknowledge.mockRejectedValueOnce(
      new TicketNotFoundError(ticket.ticketId),
    );
    await request(server)
      .patch(`/api/tickets/${ticket.ticketId}/acknowledge`)
      .send({})
      .expect(404);
    manageTicket.acknowledge.mockRejectedValueOnce(
      new TicketLifecycleError("acknowledge", "crew_assigned"),
    );
    await request(server)
      .patch(`/api/tickets/${ticket.ticketId}/acknowledge`)
      .send({})
      .expect(409);
  });
});

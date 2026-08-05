import { createServer, type Server } from "node:http";

import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";

import type { LocalizationEvent } from "../src/application/localize-faults.js";
import type { SimulationEvent } from "../src/application/run-simulation.js";
import type { PoleStateTransition } from "../src/domain/pole-state/types.js";
import type { StartupSnapshot } from "../src/infrastructure/db/bootstrap.js";
import { WebSocketEmitter } from "../src/infrastructure/websocket-emitter.js";
import {
  attachLiveUpdates,
  LiveUpdates,
} from "../src/presentation/ws/live-updates.js";

const servers: Array<{
  server: Server;
  emitter: WebSocketEmitter;
  close: () => void;
}> = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(({ server, emitter, close }) => {
      close();
      emitter.close();
      return new Promise<void>((resolve) => server.close(() => resolve()));
    }),
  );
});

describe("Phase 14 live updates", () => {
  it("accepts /ws clients and serializes documented fault and simulation payloads", async () => {
    const { liveUpdates, url } = await createLiveUpdateServer();
    const client = await connect(url);
    const messages = collectMessages(client, 2);

    liveUpdates.publishLocalizationEvent(faultCreatedEvent());
    liveUpdates.publishSimulationEvent(simulationStartedEvent());

    await expect(messages).resolves.toEqual([
      expect.objectContaining({
        type: "fault.created",
        payload: expect.objectContaining({
          fault_id: "fault-1",
          dt_id: "DT-1",
          confidence_level: "HIGH",
        }),
        timestamp: expect.any(String),
        event_id: expect.any(String),
      }),
      expect.objectContaining({
        type: "simulation.started",
        payload: {
          simulation_id: "simulation-1",
          fault_type: null,
          target_id: null,
        },
      }),
    ]);

    client.close();
  });

  it("preserves entity emission order and batches pole changes per DT in one microtask", async () => {
    const { liveUpdates, url } = await createLiveUpdateServer();
    const client = await connect(url);
    const messages = collectMessages(client, 4);

    liveUpdates.publishLocalizationEvent(ticketUpdatedEvent("detected"));
    liveUpdates.publishLocalizationEvent(ticketUpdatedEvent("acknowledged"));
    liveUpdates.publishPoleStateTransition(transition("P-1", "LIVE", "DARK"));
    liveUpdates.publishPoleStateTransition(transition("P-2", "LIVE", "DARK"));
    liveUpdates.publishPoleStateTransition(transition("P-3", "DARK", "LIVE"));

    await expect(messages).resolves.toEqual([
      expect.objectContaining({
        type: "ticket.updated",
        payload: expect.objectContaining({
          ticket_id: "ticket-1",
          status: "detected",
        }),
      }),
      expect.objectContaining({
        type: "ticket.updated",
        payload: expect.objectContaining({
          ticket_id: "ticket-1",
          status: "acknowledged",
          previous_status: "detected",
        }),
      }),
      expect.objectContaining({
        type: "pole.state_changed",
        payload: {
          changes: [
            expect.objectContaining({ pole_id: "P-1", dt_id: "DT-1" }),
            expect.objectContaining({ pole_id: "P-2", dt_id: "DT-1" }),
          ],
        },
      }),
      expect.objectContaining({
        type: "pole.state_changed",
        payload: {
          changes: [expect.objectContaining({ pole_id: "P-3", dt_id: "DT-2" })],
        },
      }),
    ]);

    client.close();
  });

  it("does not depend on connected clients to accept internal notifications", async () => {
    const emitter = new WebSocketEmitter();
    const liveUpdates = new LiveUpdates(emitter, startupSnapshot());

    expect(() => {
      liveUpdates.publishLocalizationEvent(faultCreatedEvent());
      liveUpdates.publishSimulationEvent(simulationStartedEvent());
      liveUpdates.publishPoleStateTransition(transition("P-1", "LIVE", "DARK"));
    }).not.toThrow();
    await Promise.resolve();
  });

  it("delivers the remaining documented fault, ticket, and completion events", async () => {
    const { liveUpdates, url } = await createLiveUpdateServer();
    const client = await connect(url);
    const messages = collectMessages(client, 3);

    liveUpdates.publishLocalizationEvent(faultUpdatedEvent());
    liveUpdates.publishLocalizationEvent(ticketCreatedEvent());
    liveUpdates.publishSimulationEvent(simulationCompletedEvent());

    await expect(messages).resolves.toEqual([
      expect.objectContaining({
        type: "fault.updated",
        payload: expect.objectContaining({
          fault_id: "fault-1",
          status: "resolved",
          resolved_at: "2026-08-05T12:00:00.000Z",
        }),
      }),
      expect.objectContaining({
        type: "ticket.created",
        payload: expect.objectContaining({
          ticket_id: "ticket-1",
          fault_id: "fault-1",
          status: "detected",
        }),
      }),
      expect.objectContaining({
        type: "simulation.completed",
        payload: {
          simulation_id: "simulation-1",
          result: "repair_verified",
          fault_id: "fault-1",
          ticket_id: null,
          duration_ms: 100,
        },
      }),
    ]);

    client.close();
  });
});

async function createLiveUpdateServer() {
  const server = createServer();
  const emitter = new WebSocketEmitter();
  const liveUpdates = new LiveUpdates(emitter, startupSnapshot());
  const webSocketServer = attachLiveUpdates(server, emitter);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Test server did not bind to a TCP port");
  }
  servers.push({
    server,
    emitter,
    close: () => webSocketServer.close(),
  });
  return { liveUpdates, url: `ws://127.0.0.1:${address.port}/ws` };
}

function connect(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const client = new WebSocket(url);
    client.once("open", () => resolve(client));
    client.once("error", reject);
  });
}

function collectMessages(client: WebSocket, count: number): Promise<unknown[]> {
  return new Promise((resolve) => {
    const messages: unknown[] = [];
    client.on("message", (data) => {
      messages.push(JSON.parse(data.toString()));
      if (messages.length === count) {
        resolve(messages);
      }
    });
  });
}

function startupSnapshot(): StartupSnapshot {
  return {
    feeders: [],
    distributionTransformers: [],
    poles: [
      { poleId: "P-1", dtId: "DT-1" },
      { poleId: "P-2", dtId: "DT-1" },
      { poleId: "P-3", dtId: "DT-2" },
    ],
    poleStates: [],
  } as unknown as StartupSnapshot;
}

function faultCreatedEvent(): LocalizationEvent {
  const now = new Date("2026-08-05T12:00:00.000Z");
  return {
    type: "fault.created",
    fault: {
      faultId: "fault-1",
      feederId: "F-1",
      dtId: "DT-1",
      faultType: "span",
      status: "active",
      spanPoleA: "P-1",
      spanPoleB: "P-2",
      lat: 12.9,
      lon: 77.5,
      pincode: "560001",
      affectedPoleCount: 2,
      confidenceLevel: "HIGH",
      topologySource: "RECORDED",
      evidence: {},
      aiSummary: null,
      detectedAt: now,
      resolvedAt: null,
      createdAt: now,
      updatedAt: now,
    },
  } as LocalizationEvent;
}

function ticketUpdatedEvent(
  status: "detected" | "acknowledged",
): LocalizationEvent {
  const now = new Date("2026-08-05T12:00:00.000Z");
  return {
    type: "ticket.updated",
    previousStatus: status === "detected" ? "detected" : "detected",
    ticket: {
      ticketId: "ticket-1",
      faultId: "fault-1",
      status,
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
    },
  } as LocalizationEvent;
}

function faultUpdatedEvent(): LocalizationEvent {
  const event = faultCreatedEvent();
  if (event.type !== "fault.created") {
    throw new Error("Expected a created fault fixture");
  }
  return {
    type: "fault.updated",
    fault: {
      ...event.fault,
      status: "resolved",
      resolvedAt: new Date("2026-08-05T12:00:00.000Z"),
    },
  } as LocalizationEvent;
}

function ticketCreatedEvent(): LocalizationEvent {
  const ticketUpdate = ticketUpdatedEvent("detected");
  const fault = faultCreatedEvent();
  if (
    ticketUpdate.type !== "ticket.updated" ||
    fault.type !== "fault.created"
  ) {
    throw new Error("Expected ticket and fault fixtures");
  }
  return {
    type: "ticket.created",
    ticket: ticketUpdate.ticket,
    fault: fault.fault,
  } as LocalizationEvent;
}

function simulationStartedEvent(): SimulationEvent {
  return {
    type: "simulation.started",
    simulationId: "simulation-1",
    faultType: null,
    targetId: null,
  };
}

function simulationCompletedEvent(): SimulationEvent {
  return {
    type: "simulation.completed",
    simulationId: "simulation-1",
    result: "repair_verified",
    faultId: "fault-1",
    ticketId: null,
    durationMs: 100,
  };
}

function transition(
  poleId: string,
  previous: "LIVE" | "DARK",
  current: "LIVE" | "DARK",
): PoleStateTransition {
  const now = new Date("2026-08-05T12:00:00.000Z");
  return {
    previousState: {
      poleId,
      energized: previous,
      lastHeartbeatAt: null,
      lastEventAt: null,
      lastBootCounter: null,
      lastSeq: null,
      firmwareVersion: null,
      deviceHealth: "HEALTHY",
      hasDevice: true,
      batteryMv: null,
      rssi: null,
      updatedAt: now,
    },
    currentState: {
      poleId,
      energized: current,
      lastHeartbeatAt: null,
      lastEventAt: null,
      lastBootCounter: null,
      lastSeq: null,
      firmwareVersion: null,
      deviceHealth: "HEALTHY",
      hasDevice: true,
      batteryMv: null,
      rssi: null,
      updatedAt: now,
    },
  };
}

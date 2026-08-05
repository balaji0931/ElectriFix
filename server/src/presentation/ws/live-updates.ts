import type { Server } from "node:http";

import { v7 as uuidv7 } from "uuid";
import { WebSocketServer } from "ws";

import type { LocalizationEvent } from "../../application/localize-faults.js";
import type { SimulationEvent } from "../../application/run-simulation.js";
import type { FaultStatus, TicketStatus } from "../../domain/contracts.js";
import type { StartupSnapshot } from "../../infrastructure/db/bootstrap.js";
import { WebSocketEmitter } from "../../infrastructure/websocket-emitter.js";
import { faultSummary } from "../api-serializers.js";
import type { ApiWebSocketMessage } from "../contracts/api.models.js";
import type { PoleStateTransition } from "../../domain/pole-state/types.js";

interface PoleStateChange {
  readonly pole_id: string;
  readonly previous_state: PoleStateTransition["previousState"]["energized"];
  readonly new_state: PoleStateTransition["currentState"]["energized"];
  readonly dt_id: string;
}

/**
 * Presentation-level translation of existing internal events into the frozen
 * WebSocket contract. It does not make business decisions or retain history.
 */
export class LiveUpdates {
  private readonly dtIdByPoleId: ReadonlyMap<string, string>;
  private readonly pendingPoleChangesByDt = new Map<
    string,
    PoleStateChange[]
  >();
  private poleFlushScheduled = false;

  constructor(
    private readonly emitter: WebSocketEmitter,
    startupSnapshot: StartupSnapshot,
  ) {
    this.dtIdByPoleId = new Map(
      startupSnapshot.poles.map((pole) => [pole.poleId, pole.dtId]),
    );
  }

  publishLocalizationEvent(event: LocalizationEvent): void {
    switch (event.type) {
      case "fault.created":
        this.broadcast({
          type: "fault.created",
          payload: faultSummary(event.fault),
        });
        return;
      case "fault.updated":
        this.broadcast({
          type: "fault.updated",
          payload: {
            fault_id: event.fault.faultId,
            status: event.fault.status as FaultStatus,
            affected_pole_count: event.fault.affectedPoleCount,
            ai_summary: event.fault.aiSummary,
            resolved_at: event.fault.resolvedAt?.toISOString() ?? null,
          },
        });
        return;
      case "ticket.created":
        this.broadcast({
          type: "ticket.created",
          payload: {
            ticket_id: event.ticket.ticketId,
            fault_id: event.ticket.faultId,
            status: event.ticket.status as TicketStatus,
            fault_summary: faultSummary(event.fault),
          },
        });
        return;
      case "ticket.updated":
        this.broadcast({
          type: "ticket.updated",
          payload: {
            ticket_id: event.ticket.ticketId,
            status: event.ticket.status as TicketStatus,
            previous_status: event.previousStatus,
            rejection_count: event.ticket.rejectionCount,
            rejection_reason: event.ticket.rejectionReason,
            updated_at: event.ticket.updatedAt.toISOString(),
          },
        });
    }
  }

  publishSimulationEvent(event: SimulationEvent): void {
    if (event.type === "simulation.started") {
      this.broadcast({
        type: "simulation.started",
        payload: {
          simulation_id: event.simulationId,
          fault_type: event.faultType,
          target_id: event.targetId,
        },
      });
      return;
    }

    this.broadcast({
      type: "simulation.completed",
      payload: {
        simulation_id: event.simulationId,
        result: event.result,
        fault_id: event.faultId,
        ticket_id: event.ticketId,
        duration_ms: event.durationMs,
      },
    });
  }

  publishPoleStateTransition(transition: PoleStateTransition): void {
    const poleId = transition.currentState.poleId;
    const dtId = this.dtIdByPoleId.get(poleId);
    if (!dtId) {
      throw new Error(`WebSocket update references unknown pole ${poleId}`);
    }

    const changes = this.pendingPoleChangesByDt.get(dtId) ?? [];
    changes.push({
      pole_id: poleId,
      previous_state: transition.previousState.energized,
      new_state: transition.currentState.energized,
      dt_id: dtId,
    });
    this.pendingPoleChangesByDt.set(dtId, changes);

    if (!this.poleFlushScheduled) {
      this.poleFlushScheduled = true;
      queueMicrotask(() => this.flushPoleStateChanges());
    }
  }

  private flushPoleStateChanges(): void {
    this.poleFlushScheduled = false;
    for (const changes of this.pendingPoleChangesByDt.values()) {
      this.broadcast({ type: "pole.state_changed", payload: { changes } });
    }
    this.pendingPoleChangesByDt.clear();
  }

  private broadcast(
    message: Omit<ApiWebSocketMessage, "timestamp" | "event_id">,
  ): void {
    this.emitter.broadcast({
      ...message,
      timestamp: new Date().toISOString(),
      event_id: uuidv7(),
    } as ApiWebSocketMessage);
  }
}

export function attachLiveUpdates(
  server: Server,
  emitter: WebSocketEmitter,
): WebSocketServer {
  const webSocketServer = new WebSocketServer({ server, path: "/ws" });
  webSocketServer.on("connection", (client) => {
    emitter.addClient(client);
  });
  return webSocketServer;
}

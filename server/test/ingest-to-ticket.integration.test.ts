import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";

import { IngestTelemetry } from "../src/application/ingest-telemetry.js";
import {
  LocalizeFaults,
  type LocalizationEvent,
} from "../src/application/localize-faults.js";
import { defaultProductPolicies } from "../src/config/policies.js";
import { FaultLocalizationEngine } from "../src/domain/localization/fault-localization-engine.js";
import { DeadSensorDetector } from "../src/domain/noise-filter/dead-sensor-detector.js";
import { ScheduledOutageFilter } from "../src/domain/noise-filter/scheduled-outage-filter.js";
import { PoleStateService } from "../src/domain/pole-state/pole-state-service.js";
import { CachedTopologyResolver } from "../src/domain/topology/topology-resolver.js";
import { bootstrapStartupState } from "../src/infrastructure/db/bootstrap.js";
import {
  createDatabaseConnection,
  type DatabaseConnection,
} from "../src/infrastructure/db/client.js";
import { runMigrations } from "../src/infrastructure/db/migrate.js";
import { seedDatabase } from "../src/infrastructure/db/seed.js";
import { faults, tickets } from "../src/infrastructure/db/schema.js";
import { EventPipeline } from "../src/infrastructure/event-pipeline.js";
import { NetworkRepository } from "../src/infrastructure/repositories/network-repository.js";
import { PoleRepository } from "../src/infrastructure/repositories/pole-repository.js";
import { TelemetryRepository } from "../src/infrastructure/repositories/telemetry-repository.js";
import { TicketRepository } from "../src/infrastructure/repositories/ticket-repository.js";
import { ScheduledOutageClient } from "../src/infrastructure/scheduled-outage-client.js";
import { createApp } from "../src/presentation/app.js";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const integrationDescribe = testDatabaseUrl ? describe : describe.skip;
const seedTime = new Date("2026-08-05T12:00:00.000Z");
const dtId = "D-0025";
const upstreamPoleId = "P-001609";
const downstreamPoleId = "P-001610";
const upstreamDeviceId = "DEV-001609";
const downstreamDeviceId = "DEV-001610";

integrationDescribe("Phase 9 ingest-to-ticket flow", () => {
  let connection: DatabaseConnection;
  let pipeline: EventPipeline | undefined;

  beforeAll(async () => {
    connection = createDatabaseConnection(testDatabaseUrl!);
    await runMigrations(connection.pool);
    await seedDatabase(connection.pool, seedTime);
  });

  beforeEach(async () => {
    await connection.pool.query(
      "DELETE FROM tickets WHERE fault_id IN (SELECT fault_id FROM faults WHERE dt_id = $1)",
      [dtId],
    );
    await connection.pool.query("DELETE FROM faults WHERE dt_id = $1", [dtId]);
    await connection.pool.query(
      "DELETE FROM telemetry_events WHERE pole_id IN (SELECT pole_id FROM poles WHERE dt_id = $1)",
      [dtId],
    );
    await connection.pool.query(
      `UPDATE pole_states
       SET energized = 'UNKNOWN',
           last_heartbeat_at = NULL,
           last_event_at = NULL,
           last_boot_counter = NULL,
           last_seq = NULL,
           firmware_version = NULL,
           battery_mv = NULL,
           rssi = NULL,
           updated_at = $1
       WHERE pole_id IN (SELECT pole_id FROM poles WHERE dt_id = $2)`,
      [seedTime, dtId],
    );
  });

  afterAll(async () => {
    pipeline?.dispose();
    await connection.pool.end();
  });

  it("POST /api/telemetry drives EventPipeline through fault and ticket persistence exactly once", async () => {
    const networkRepository = new NetworkRepository(connection.db);
    const poleRepository = new PoleRepository(connection.db);
    const startupSnapshot = await bootstrapStartupState(
      networkRepository,
      poleRepository,
    );
    const poleStateService = new PoleStateService(poleRepository);
    await poleStateService.rebuildCache();
    const events: LocalizationEvent[] = [];
    const localizeFaults = new LocalizeFaults({
      startupSnapshot,
      poleStateReader: poleStateService,
      topologyResolver: new CachedTopologyResolver(startupSnapshot),
      localizationEngine: new FaultLocalizationEngine(defaultProductPolicies),
      deadSensorDetector: new DeadSensorDetector(),
      scheduledOutageFilter: new ScheduledOutageFilter(defaultProductPolicies),
      scheduledOutageProvider: new ScheduledOutageClient(networkRepository),
      faultTicketStore: new TicketRepository(connection.db),
      publisher: {
        publish(event) {
          events.push(event);
        },
      },
    });
    poleStateService.subscribe((transition) => {
      void localizeFaults.handleTransition(transition);
    });
    const eventPipeline = new EventPipeline(
      startupSnapshot,
      new TelemetryRepository(connection.db),
      poleStateService,
      { error: () => undefined },
    );
    pipeline = eventPipeline;
    const app = createApp({
      checkDatabase: async () => {
        await connection.pool.query("SELECT 1");
      },
      startedAt: seedTime.getTime(),
      version: "test",
      ingestTelemetry: new IngestTelemetry(eventPipeline),
    });

    await request(app)
      .post("/api/telemetry")
      .send(telemetry(upstreamDeviceId, upstreamPoleId, "boot", true, 1))
      .expect(202);
    await waitFor(async () => {
      expect(poleStateService.getPoleState(upstreamPoleId)?.energized).toBe(
        "LIVE",
      );
    });

    const powerLost = telemetry(
      downstreamDeviceId,
      downstreamPoleId,
      "power_lost",
      false,
      1,
    );
    await request(app).post("/api/telemetry").send(powerLost).expect(202);

    await waitFor(async () => {
      const storedFaults = await connection.db
        .select()
        .from(faults)
        .where(eq(faults.dtId, dtId));
      expect(storedFaults).toHaveLength(1);
      expect(storedFaults[0]).toMatchObject({
        faultType: "dt",
        status: "active",
        topologySource: "FALLBACK",
      });
      const storedTickets = await connection.db
        .select()
        .from(tickets)
        .where(eq(tickets.faultId, storedFaults[0]!.faultId));
      expect(storedTickets).toHaveLength(1);
      expect(storedTickets[0]).toMatchObject({ status: "detected" });
    });
    expect(events.map((event) => event.type)).toEqual([
      "fault.created",
      "ticket.created",
    ]);

    await request(app).post("/api/telemetry").send(powerLost).expect(202);
    await new Promise((resolve) => setTimeout(resolve, 75));

    const storedFaults = await connection.db
      .select()
      .from(faults)
      .where(eq(faults.dtId, dtId));
    const storedTickets = await connection.db
      .select()
      .from(tickets)
      .where(eq(tickets.faultId, storedFaults[0]!.faultId));
    expect(storedFaults).toHaveLength(1);
    expect(storedTickets).toHaveLength(1);
    expect(events).toHaveLength(2);
  });
});

function telemetry(
  deviceId: string,
  poleId: string,
  event: "boot" | "power_lost",
  energized: boolean,
  seq: number,
) {
  return {
    device_id: deviceId,
    pole_id: poleId,
    event,
    energized,
    ts: "2026-08-05T12:01:00.000Z",
    boot_counter: 1,
    seq,
    fw: "1.4.2",
  };
}

async function waitFor(
  assertion: () => Promise<void>,
  timeoutMs = 2_000,
): Promise<void> {
  const startedAt = Date.now();
  for (;;) {
    try {
      await assertion();
      return;
    } catch (error) {
      if (Date.now() - startedAt >= timeoutMs) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
}

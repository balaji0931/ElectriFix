import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { bootstrapStartupState } from "../src/infrastructure/db/bootstrap.js";
import {
  createDatabaseConnection,
  type DatabaseConnection,
} from "../src/infrastructure/db/client.js";
import { runMigrations } from "../src/infrastructure/db/migrate.js";
import { seedDatabase } from "../src/infrastructure/db/seed.js";
import { faults, tickets } from "../src/infrastructure/db/schema.js";
import { NetworkRepository } from "../src/infrastructure/repositories/network-repository.js";
import { PoleRepository } from "../src/infrastructure/repositories/pole-repository.js";
import { TelemetryRepository } from "../src/infrastructure/repositories/telemetry-repository.js";
import { TicketRepository } from "../src/infrastructure/repositories/ticket-repository.js";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const integrationDescribe = testDatabaseUrl ? describe : describe.skip;

const createdAt = new Date("2026-08-05T12:00:00.000Z");

integrationDescribe("Phase 3 repositories and startup bootstrap", () => {
  let connection: DatabaseConnection;
  let networkRepository: NetworkRepository;
  let poleRepository: PoleRepository;
  let telemetryRepository: TelemetryRepository;
  let ticketRepository: TicketRepository;

  beforeAll(async () => {
    connection = createDatabaseConnection(testDatabaseUrl!);
    await runMigrations(connection.pool);
    await seedDatabase(connection.pool, createdAt);

    networkRepository = new NetworkRepository(connection.db);
    poleRepository = new PoleRepository(connection.db);
    telemetryRepository = new TelemetryRepository(connection.db);
    ticketRepository = new TicketRepository(connection.db);
  });

  beforeEach(async () => {
    await connection.db.execute(
      sql`DELETE FROM telemetry_events WHERE device_id LIKE 'TEST-REPOSITORY-%'`,
    );
    await connection.db.execute(
      sql`DELETE FROM tickets WHERE ticket_id::text LIKE '018f8acb-0000-7000-8000-0000000002%'`,
    );
    await connection.db.execute(
      sql`DELETE FROM faults WHERE fault_id::text LIKE '018f8acb-0000-7000-8000-0000000001%'`,
    );
  });

  afterAll(async () => {
    await connection.pool.end();
  });

  it("keeps the network repository read-only", () => {
    const methodNames = Object.getOwnPropertyNames(NetworkRepository.prototype);

    expect(methodNames).toEqual([
      "constructor",
      "listFeeders",
      "listDistributionTransformers",
      "listPoles",
      "findPolesByDistributionTransformer",
      "findPoleByDeviceId",
      "listScheduledOutages",
    ]);
  });

  it("loads seeded registry and durable pole states into an immutable startup snapshot", async () => {
    const snapshot = await bootstrapStartupState(
      networkRepository,
      poleRepository,
    );

    expect(snapshot.feeders.length).toBeGreaterThan(0);
    expect(snapshot.distributionTransformers.length).toBeGreaterThan(0);
    expect(snapshot.poles.length).toBeGreaterThan(0);
    expect(snapshot.poleStates).toHaveLength(snapshot.poles.length);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.poles)).toBe(true);
    expect(Object.isFrozen(snapshot.poleStates)).toBe(true);
  });

  it("persists a pole state update without changing registry data", async () => {
    const original = await poleRepository.findPoleState("P-000001");

    expect(original).toBeDefined();

    const updated = await poleRepository.updatePoleState("P-000001", {
      lastSeq: 42,
      updatedAt: createdAt,
    });

    expect(updated?.lastSeq).toBe(42);

    await poleRepository.updatePoleState("P-000001", {
      energized: original!.energized,
      lastHeartbeatAt: original!.lastHeartbeatAt,
      lastEventAt: original!.lastEventAt,
      lastSeq: original!.lastSeq,
      firmwareVersion: original!.firmwareVersion,
      deviceHealth: original!.deviceHealth,
      hasDevice: original!.hasDevice,
      batteryMv: original!.batteryMv,
      rssi: original!.rssi,
      updatedAt: original!.updatedAt,
    });
  });

  it("drops duplicate telemetry through the database uniqueness constraint", async () => {
    const event = {
      id: "018f8acb-0000-7000-8000-000000000301",
      deviceId: "TEST-REPOSITORY-DEVICE-001",
      poleId: "P-000001",
      event: "heartbeat",
      energized: true,
      deviceTs: createdAt,
      seq: 1,
      receivedAt: createdAt,
    };

    expect(await telemetryRepository.insertTelemetryEvent(event)).toMatchObject(
      { id: event.id },
    );
    expect(
      await telemetryRepository.insertTelemetryEvent({
        ...event,
        id: "018f8acb-0000-7000-8000-000000000302",
      }),
    ).toBeUndefined();
  });

  it("persists a pre-built fault and ticket atomically", async () => {
    const faultId = "018f8acb-0000-7000-8000-000000000101";
    const ticketId = "018f8acb-0000-7000-8000-000000000201";

    const created = await ticketRepository.createFaultAndTicket(
      faultInput(faultId),
      ticketInput(ticketId, faultId),
    );

    expect(created.fault.faultId).toBe(faultId);
    expect(created.ticket.faultId).toBe(faultId);
  });

  it("rolls back the fault insert when the paired ticket insert fails", async () => {
    const faultId = "018f8acb-0000-7000-8000-000000000102";

    await expect(
      ticketRepository.createFaultAndTicket(
        faultInput(faultId),
        ticketInput(
          "018f8acb-0000-7000-8000-000000000202",
          "018f8acb-0000-7000-8000-000000009999",
        ),
      ),
    ).rejects.toThrow();

    const [storedFault] = await connection.db
      .select()
      .from(faults)
      .where(eq(faults.faultId, faultId));
    const [storedTicket] = await connection.db
      .select()
      .from(tickets)
      .where(eq(tickets.ticketId, "018f8acb-0000-7000-8000-000000000202"));

    expect(storedFault).toBeUndefined();
    expect(storedTicket).toBeUndefined();
  });
});

function faultInput(faultId: string) {
  return {
    faultId,
    dtId: "D-0001",
    feederId: "F-07-01",
    faultType: "dt" as const,
    status: "active",
    spanPoleA: null,
    spanPoleB: null,
    lat: 12.9005,
    lon: 77.5205,
    pincode: "560001",
    affectedPoleCount: 1,
    confidenceLevel: "LOW",
    topologySource: "FALLBACK",
    evidence: {
      last_live_pole: null,
      first_dark_pole: null,
      fault_span: null,
      affected_poles: ["P-000001"],
      affected_pole_count: 1,
      topology_source: "FALLBACK",
      confidence_level: "LOW",
      confidence_reasons: [],
      coordinates: { lat: 12.9005, lon: 77.5205 },
      pincode: "560001",
      suppressed_sensors: [],
    },
    detectedAt: createdAt,
    resolvedAt: null,
    createdAt,
    updatedAt: createdAt,
  };
}

function ticketInput(ticketId: string, faultId: string) {
  return {
    ticketId,
    faultId,
    status: "detected",
    assignedCrew: null,
    operatorNotes: null,
    rejectionCount: 0,
    rejectionReason: null,
    detectedAt: createdAt,
    acknowledgedAt: null,
    crewAssignedAt: null,
    resolvedAt: null,
    verifiedAt: null,
    closedAt: null,
    createdAt,
    updatedAt: createdAt,
  };
}

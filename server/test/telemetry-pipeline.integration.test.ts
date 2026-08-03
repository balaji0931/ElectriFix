import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { PoleStateService } from "../src/domain/pole-state/pole-state-service.js";
import { bootstrapStartupState } from "../src/infrastructure/db/bootstrap.js";
import {
  createDatabaseConnection,
  type DatabaseConnection,
} from "../src/infrastructure/db/client.js";
import { runMigrations } from "../src/infrastructure/db/migrate.js";
import { seedDatabase } from "../src/infrastructure/db/seed.js";
import { EventPipeline } from "../src/infrastructure/event-pipeline.js";
import { NetworkRepository } from "../src/infrastructure/repositories/network-repository.js";
import { PoleRepository } from "../src/infrastructure/repositories/pole-repository.js";
import { TelemetryRepository } from "../src/infrastructure/repositories/telemetry-repository.js";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const integrationDescribe = testDatabaseUrl ? describe : describe.skip;
const seedTime = new Date("2026-08-05T12:00:00.000Z");
const poleId = "P-000011";
const deviceId = "DEV-000011";
const pipelines: EventPipeline[] = [];
let networkRepository: NetworkRepository;
let poleRepository: PoleRepository;
let telemetryRepository: TelemetryRepository;

integrationDescribe("Phase 7 telemetry ingest", () => {
  let connection: DatabaseConnection;

  beforeAll(async () => {
    connection = createDatabaseConnection(testDatabaseUrl!);
    await runMigrations(connection.pool);
    await seedDatabase(connection.pool, seedTime);
    networkRepository = new NetworkRepository(connection.db);
    poleRepository = new PoleRepository(connection.db);
    telemetryRepository = new TelemetryRepository(connection.db);
  });

  beforeEach(async () => {
    await connection.pool.query(
      "DELETE FROM telemetry_events WHERE device_id = $1",
      [deviceId],
    );
    await poleRepository.updatePoleState(poleId, {
      energized: "UNKNOWN",
      lastHeartbeatAt: null,
      lastEventAt: null,
      lastBootCounter: null,
      lastSeq: null,
      firmwareVersion: null,
      batteryMv: null,
      rssi: null,
      updatedAt: seedTime,
    });
  });

  afterAll(async () => {
    for (const pipeline of pipelines) {
      pipeline.dispose();
    }
    await connection.pool.end();
  });

  it("deduplicates tuples, rejects stale retries, accepts reboots, and rebuilds after restart", async () => {
    const pipeline = await createPipeline();
    const event = telemetry({ boot_counter: 2, seq: 7 });

    await expect(pipeline.admit(event)).resolves.toEqual({
      status: "accepted",
    });
    await waitFor(async () => {
      expect(
        await telemetryRepository.findTelemetryEventByTuple(deviceId, 2, 7),
      ).toBeDefined();
    });
    await expect(pipeline.admit(event)).resolves.toEqual({
      status: "duplicate",
    });
    await expect(
      pipeline.admit(telemetry({ boot_counter: 2, seq: 6 })),
    ).resolves.toEqual({ status: "stale" });
    await expect(
      pipeline.admit(telemetry({ boot_counter: 3, seq: 0 })),
    ).resolves.toEqual({ status: "accepted" });
    await waitFor(async () => {
      expect(
        (await poleRepository.findPoleState(poleId))?.lastBootCounter,
      ).toBe(3);
    });

    const restartedStateService = new PoleStateService(poleRepository);
    await restartedStateService.rebuildCache();
    expect(restartedStateService.getPoleState(poleId)).toMatchObject({
      lastBootCounter: 3,
      lastSeq: 0,
    });
  });
});

async function createPipeline(): Promise<EventPipeline> {
  const snapshot = await bootstrapStartupState(
    networkRepository,
    poleRepository,
  );
  const stateService = new PoleStateService(poleRepository);
  await stateService.rebuildCache();
  const pipeline = new EventPipeline(
    snapshot,
    telemetryRepository,
    stateService,
    {
      error: () => undefined,
    },
  );
  pipelines.push(pipeline);
  return pipeline;
}

function telemetry(overrides: Partial<{ boot_counter: number; seq: number }>) {
  return {
    device_id: deviceId,
    pole_id: poleId,
    event: "heartbeat" as const,
    energized: true,
    ts: "2026-08-05T12:01:00.000Z",
    boot_counter: 0,
    seq: 0,
    ...overrides,
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

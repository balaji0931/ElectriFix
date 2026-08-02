import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PoleStateService } from "../src/domain/pole-state/pole-state-service.js";
import {
  createDatabaseConnection,
  type DatabaseConnection,
} from "../src/infrastructure/db/client.js";
import { runMigrations } from "../src/infrastructure/db/migrate.js";
import { seedDatabase } from "../src/infrastructure/db/seed.js";
import { PoleRepository } from "../src/infrastructure/repositories/pole-repository.js";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const integrationDescribe = testDatabaseUrl ? describe : describe.skip;
const seedTime = new Date("2026-08-05T12:00:00.000Z");

integrationDescribe("PoleStateService persistence", () => {
  let connection: DatabaseConnection;
  let repository: PoleRepository;

  beforeAll(async () => {
    connection = createDatabaseConnection(testDatabaseUrl!);
    await runMigrations(connection.pool);
    await seedDatabase(connection.pool, seedTime);
    repository = new PoleRepository(connection.db);
  });

  afterAll(async () => {
    await connection.pool.end();
  });

  it("rebuilds seeded state and synchronizes a state transition to persistence", async () => {
    const original = await repository.findPoleState("P-000001");
    expect(original).toBeDefined();

    const service = new PoleStateService(repository);
    await service.rebuildCache();

    expect(service.getPoleStates()).toHaveLength(4_000);

    const receivedAt = new Date("2026-08-05T12:05:00.000Z");
    await service.applyEvent({
      poleId: "P-000001",
      event: "power_lost",
      seq: 23,
      receivedAt,
      firmware: "1.4.2",
      batteryMv: 3600,
      rssi: -70,
    });

    const persisted = await repository.findPoleState("P-000001");
    expect(persisted).toMatchObject({
      energized: "DARK",
      lastSeq: 23,
      firmwareVersion: "1.4.2",
      batteryMv: 3600,
      rssi: -70,
    });
    expect(service.getPoleState("P-000001")).toMatchObject({
      energized: "DARK",
      lastSeq: 23,
    });

    await repository.updatePoleState("P-000001", {
      energized: original!.energized,
      lastHeartbeatAt: original!.lastHeartbeatAt,
      lastEventAt: original!.lastEventAt,
      lastSeq: original!.lastSeq,
      firmwareVersion: original!.firmwareVersion,
      batteryMv: original!.batteryMv,
      rssi: original!.rssi,
      updatedAt: original!.updatedAt,
    });
  });
});

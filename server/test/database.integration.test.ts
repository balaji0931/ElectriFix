import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { runMigrations } from "../src/infrastructure/db/migrate.js";
import { seedDatabase } from "../src/infrastructure/db/seed.js";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const integrationDescribe = testDatabaseUrl ? describe : describe.skip;

integrationDescribe("Phase 1 PostgreSQL migration and seed", () => {
  const pool = new Pool({ connectionString: testDatabaseUrl });
  const db = drizzle(pool);

  beforeAll(async () => {
    await runMigrations(pool);
    await seedDatabase(pool, new Date("2026-08-05T10:00:00.000Z"));
  });

  beforeEach(async () => {
    await db.execute(sql`DELETE FROM telemetry_events`);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("migrates and seeds the documented rows", async () => {
    const feeders = await db.execute<{ count: string }>(
      sql`SELECT COUNT(*)::text AS count FROM feeders`,
    );
    const transformers = await db.execute<{ count: string }>(
      sql`SELECT COUNT(*)::text AS count FROM distribution_transformers`,
    );
    const poles = await db.execute<{ count: string }>(
      sql`SELECT COUNT(*)::text AS count FROM poles`,
    );
    const states = await db.execute<{ count: string }>(
      sql`SELECT COUNT(*)::text AS count FROM pole_states`,
    );

    expect(feeders.rows[0]?.count).toBe("5");
    expect(transformers.rows[0]?.count).toBe("60");
    expect(poles.rows[0]?.count).toBe("4000");
    expect(states.rows[0]?.count).toBe("4000");
  });

  it("is idempotent and refreshes deterministic outage windows", async () => {
    await seedDatabase(pool, new Date("2026-08-05T11:00:00.000Z"));

    const registry = await db.execute<{ feeders: string; outages: string }>(
      sql`SELECT
        (SELECT COUNT(*)::text FROM feeders) AS feeders,
        (SELECT COUNT(*)::text FROM scheduled_outages) AS outages`,
    );
    const outage = await db.execute<{ matches_expected_window: boolean }>(
      sql`SELECT scheduled_start = TIMESTAMP '2026-08-05 10:45:00' AS matches_expected_window
          FROM scheduled_outages
          WHERE outage_id = 'SO-003'`,
    );

    expect(registry.rows[0]?.feeders).toBe("5");
    expect(registry.rows[0]?.outages).toBe("15");
    expect(outage.rows[0]?.matches_expected_window).toBe(true);
  });

  it("enforces representative enum and telemetry stream identity constraints", async () => {
    await expect(
      db.execute(
        sql`INSERT INTO pole_states (pole_id, energized, device_health, has_device, updated_at)
            VALUES ('P-000001', 'INVALID', 'HEALTHY', true, NOW())`,
      ),
    ).rejects.toThrow();

    await db.execute(
      sql`INSERT INTO telemetry_events (id, device_id, pole_id, event, energized, device_ts, boot_counter, seq, received_at)
          VALUES ('018f8acb-0000-7000-8000-000000000001', 'DEV-000001', 'P-000001', 'heartbeat', true, NOW(), 3, 1, NOW())`,
    );

    await expect(
      db.execute(
        sql`INSERT INTO telemetry_events (id, device_id, pole_id, event, energized, device_ts, boot_counter, seq, received_at)
            VALUES ('018f8acb-0000-7000-8000-000000000002', 'DEV-000001', 'P-000001', 'heartbeat', true, NOW(), 3, 1, NOW())`,
      ),
    ).rejects.toThrow();

    await expect(
      db.execute(
        sql`INSERT INTO telemetry_events (id, device_id, pole_id, event, energized, device_ts, boot_counter, seq, received_at)
            VALUES ('018f8acb-0000-7000-8000-000000000003', 'DEV-000001', 'P-000001', 'heartbeat', true, NOW(), 4, 1, NOW())`,
      ),
    ).resolves.toBeDefined();
  });
});

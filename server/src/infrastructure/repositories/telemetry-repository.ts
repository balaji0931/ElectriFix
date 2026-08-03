import { desc, eq } from "drizzle-orm";

import type { Database } from "../db/client.js";
import { telemetryEvents } from "../db/schema.js";

export type TelemetryEventPersistenceInput =
  typeof telemetryEvents.$inferInsert;
export type TelemetryEventPersistenceModel =
  typeof telemetryEvents.$inferSelect;

export class TelemetryRepository {
  constructor(private readonly db: Database) {}

  async insertTelemetryEvent(
    event: TelemetryEventPersistenceInput,
  ): Promise<TelemetryEventPersistenceModel | undefined> {
    const [inserted] = await this.db
      .insert(telemetryEvents)
      .values(event)
      .onConflictDoNothing({
        target: [
          telemetryEvents.deviceId,
          telemetryEvents.bootCounter,
          telemetryEvents.seq,
        ],
      })
      .returning();

    return inserted;
  }

  listEventsForPole(poleId: string) {
    return this.db
      .select()
      .from(telemetryEvents)
      .where(eq(telemetryEvents.poleId, poleId))
      .orderBy(desc(telemetryEvents.receivedAt));
  }

  listRecentEvents() {
    return this.db
      .select()
      .from(telemetryEvents)
      .orderBy(desc(telemetryEvents.receivedAt));
  }
}

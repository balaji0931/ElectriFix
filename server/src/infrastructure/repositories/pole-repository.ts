import { eq } from "drizzle-orm";

import type { Database } from "../db/client.js";
import { poleStates } from "../db/schema.js";

export type PoleStatePersistenceModel = typeof poleStates.$inferSelect;
export type PoleStatePersistenceUpdate = Partial<
  Omit<typeof poleStates.$inferInsert, "poleId">
>;

export class PoleRepository {
  constructor(private readonly db: Database) {}

  listPoleStates(): Promise<PoleStatePersistenceModel[]> {
    return this.db.select().from(poleStates);
  }

  async findPoleState(
    poleId: string,
  ): Promise<PoleStatePersistenceModel | undefined> {
    const [state] = await this.db
      .select()
      .from(poleStates)
      .where(eq(poleStates.poleId, poleId));
    return state;
  }

  async updatePoleState(
    poleId: string,
    update: PoleStatePersistenceUpdate,
  ): Promise<PoleStatePersistenceModel | undefined> {
    const [state] = await this.db
      .update(poleStates)
      .set(update)
      .where(eq(poleStates.poleId, poleId))
      .returning();

    return state;
  }
}

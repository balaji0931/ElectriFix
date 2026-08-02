import { eq } from "drizzle-orm";

import type {
  DeviceHealthStatus,
  EnergizedState,
} from "../../domain/contracts.js";
import type { Database } from "../db/client.js";
import { poleStates } from "../db/schema.js";

export type PoleStatePersistenceModel = Omit<
  typeof poleStates.$inferSelect,
  "energized" | "deviceHealth"
> & {
  energized: EnergizedState;
  deviceHealth: DeviceHealthStatus;
};
export type PoleStatePersistenceUpdate = Partial<
  Omit<
    typeof poleStates.$inferInsert,
    "poleId" | "energized" | "deviceHealth"
  > & {
    energized: EnergizedState;
    deviceHealth: DeviceHealthStatus;
  }
>;

export class PoleRepository {
  constructor(private readonly db: Database) {}

  listPoleStates(): Promise<PoleStatePersistenceModel[]> {
    return this.db
      .select()
      .from(poleStates)
      .then((states) => states as PoleStatePersistenceModel[]);
  }

  async findPoleState(
    poleId: string,
  ): Promise<PoleStatePersistenceModel | undefined> {
    const [state] = await this.db
      .select()
      .from(poleStates)
      .where(eq(poleStates.poleId, poleId));
    return state as PoleStatePersistenceModel | undefined;
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

    return state as PoleStatePersistenceModel | undefined;
  }
}

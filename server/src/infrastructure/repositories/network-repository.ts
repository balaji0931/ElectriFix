import { eq } from "drizzle-orm";

import type { Database } from "../db/client.js";
import {
  distributionTransformers,
  feeders,
  poles,
  scheduledOutages,
} from "../db/schema.js";

export class NetworkRepository {
  constructor(private readonly db: Database) {}

  listFeeders() {
    return this.db.select().from(feeders);
  }

  listDistributionTransformers() {
    return this.db.select().from(distributionTransformers);
  }

  listPoles() {
    return this.db.select().from(poles);
  }

  findPolesByDistributionTransformer(dtId: string) {
    return this.db.select().from(poles).where(eq(poles.dtId, dtId));
  }

  findPoleByDeviceId(deviceId: string) {
    return this.db
      .select()
      .from(poles)
      .where(eq(poles.deviceId, deviceId))
      .limit(1);
  }

  listScheduledOutages() {
    return this.db.select().from(scheduledOutages);
  }
}

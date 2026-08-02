import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema.js";

export type Database = NodePgDatabase<typeof schema>;

export interface DatabaseConnection {
  pool: Pool;
  db: Database;
}

/** Creates the shared PostgreSQL pool and Drizzle connection for the server process. */
export function createDatabaseConnection(
  connectionString: string,
): DatabaseConnection {
  const pool = new Pool({ connectionString });

  return {
    pool,
    db: drizzle(pool, { schema }),
  };
}

import { Pool } from "pg";

import { runMigrations } from "./migrate.js";
import { seedDatabase } from "./seed.js";

export async function initializeDatabase(
  connectionString: string,
): Promise<Pool> {
  const pool = new Pool({ connectionString });

  try {
    await runMigrations(pool);
    await seedDatabase(pool);
    return pool;
  } catch (error) {
    await pool.end();
    throw error;
  }
}

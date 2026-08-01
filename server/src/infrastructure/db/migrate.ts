import { fileURLToPath } from "node:url";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

export async function runMigrations(pool: Pool): Promise<void> {
  const db = drizzle(pool);
  const migrationsFolder = fileURLToPath(
    new URL("./migrations", import.meta.url),
  );

  await migrate(db, { migrationsFolder });
}

async function main() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is required to run migrations");
  }

  const pool = new Pool({ connectionString });

  try {
    await runMigrations(pool);
  } finally {
    await pool.end();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main();
}

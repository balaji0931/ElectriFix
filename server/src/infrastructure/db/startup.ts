import { createDatabaseConnection, type DatabaseConnection } from "./client.js";
import { runMigrations } from "./migrate.js";
import { seedDatabase } from "./seed.js";

export async function initializeDatabase(
  connectionString: string,
): Promise<DatabaseConnection> {
  const connection = createDatabaseConnection(connectionString);

  try {
    await runMigrations(connection.pool);
    await seedDatabase(connection.pool);
    return connection;
  } catch (error) {
    await connection.pool.end();
    throw error;
  }
}

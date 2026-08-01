import pino from "pino";

import { loadEnvironment } from "./config/env.js";
import { initializeDatabase } from "./infrastructure/db/startup.js";
import { createApp } from "./presentation/app.js";

const environment = loadEnvironment();
const logger = pino({ level: environment.LOG_LEVEL });
const pool = await initializeDatabase(environment.DATABASE_URL);
const startedAt = Date.now();

const app = createApp({
  checkDatabase: async () => {
    await pool.query("SELECT 1");
  },
  startedAt,
  version: environment.APP_VERSION,
});

const server = app.listen(environment.PORT, () => {
  logger.info({ port: environment.PORT }, "ElectriFix server started");
});

async function shutDown() {
  logger.info("ElectriFix server stopping");
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.once("SIGINT", shutDown);
process.once("SIGTERM", shutDown);

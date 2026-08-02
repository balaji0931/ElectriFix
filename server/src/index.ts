import pino from "pino";

import { loadEnvironment } from "./config/env.js";
import { PoleStateService } from "./domain/pole-state/pole-state-service.js";
import { bootstrapStartupState } from "./infrastructure/db/bootstrap.js";
import { initializeDatabase } from "./infrastructure/db/startup.js";
import { NetworkRepository } from "./infrastructure/repositories/network-repository.js";
import { PoleRepository } from "./infrastructure/repositories/pole-repository.js";
import { createApp } from "./presentation/app.js";

const environment = loadEnvironment();
const logger = pino({ level: environment.LOG_LEVEL });
const database = await initializeDatabase(environment.DATABASE_URL);
const networkRepository = new NetworkRepository(database.db);
const poleRepository = new PoleRepository(database.db);
const startupSnapshot = await bootstrapStartupState(
  networkRepository,
  poleRepository,
);
const poleStateService = new PoleStateService(poleRepository);
await poleStateService.rebuildCache();
const startedAt = Date.now();

const app = createApp({
  checkDatabase: async () => {
    await database.pool.query("SELECT 1");
  },
  startedAt,
  version: environment.APP_VERSION,
});

const server = app.listen(environment.PORT, () => {
  logger.info(
    {
      port: environment.PORT,
      loadedPoles: startupSnapshot.poles.length,
      loadedPoleStates: poleStateService.getPoleStates().length,
    },
    "ElectriFix server started",
  );
});

async function shutDown() {
  logger.info("ElectriFix server stopping");
  server.close(async () => {
    await database.pool.end();
    process.exit(0);
  });
}

process.once("SIGINT", shutDown);
process.once("SIGTERM", shutDown);

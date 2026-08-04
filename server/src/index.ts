import pino from "pino";

import { loadEnvironment } from "./config/env.js";
import { policies } from "./config/policies.js";
import { LocalizeFaults } from "./application/localize-faults.js";
import { ManageTicket } from "./application/manage-ticket.js";
import { FaultLocalizationEngine } from "./domain/localization/fault-localization-engine.js";
import { DeadSensorDetector } from "./domain/noise-filter/dead-sensor-detector.js";
import { ScheduledOutageFilter } from "./domain/noise-filter/scheduled-outage-filter.js";
import { PoleStateService } from "./domain/pole-state/pole-state-service.js";
import { RestorationVerifier } from "./domain/ticket/restoration-verifier.js";
import { TicketLifecycle } from "./domain/ticket/ticket-lifecycle.js";
import { CachedTopologyResolver } from "./domain/topology/topology-resolver.js";
import { bootstrapStartupState } from "./infrastructure/db/bootstrap.js";
import { initializeDatabase } from "./infrastructure/db/startup.js";
import { EventPipeline } from "./infrastructure/event-pipeline.js";
import { NetworkRepository } from "./infrastructure/repositories/network-repository.js";
import { PoleRepository } from "./infrastructure/repositories/pole-repository.js";
import { TelemetryRepository } from "./infrastructure/repositories/telemetry-repository.js";
import { TicketRepository } from "./infrastructure/repositories/ticket-repository.js";
import { ScheduledOutageClient } from "./infrastructure/scheduled-outage-client.js";
import { IngestTelemetry } from "./application/ingest-telemetry.js";
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
const eventPipeline = new EventPipeline(
  startupSnapshot,
  new TelemetryRepository(database.db),
  poleStateService,
  logger,
);
const localizeFaults = new LocalizeFaults({
  startupSnapshot,
  poleStateReader: poleStateService,
  topologyResolver: new CachedTopologyResolver(startupSnapshot),
  localizationEngine: new FaultLocalizationEngine(policies),
  deadSensorDetector: new DeadSensorDetector(),
  scheduledOutageFilter: new ScheduledOutageFilter(policies),
  scheduledOutageProvider: new ScheduledOutageClient(networkRepository),
  faultTicketStore: new TicketRepository(database.db),
  publisher: {
    publish(event) {
      logger.debug(
        { type: event.type },
        "Localization internal event published",
      );
    },
  },
});
const manageTicket = new ManageTicket({
  ticketStore: new TicketRepository(database.db),
  poleStateReader: poleStateService,
  ticketLifecycle: new TicketLifecycle(),
  restorationVerifier: new RestorationVerifier(policies),
  publisher: {
    publish(event) {
      logger.debug({ type: event.type }, "Ticket internal event published");
    },
  },
});
poleStateService.subscribe((transition) => {
  void localizeFaults.handleTransition(transition).catch((error: unknown) => {
    logger.error({ error }, "Fault localization orchestration failed");
  });
});
poleStateService.subscribe((transition) => {
  void manageTicket
    .handlePoleStateTransition(transition)
    .catch((error: unknown) => {
      logger.error({ error }, "Ticket restoration verification failed");
    });
});
const ingestTelemetry = new IngestTelemetry(eventPipeline);
const startedAt = Date.now();

const app = createApp({
  checkDatabase: async () => {
    await database.pool.query("SELECT 1");
  },
  startedAt,
  version: environment.APP_VERSION,
  ingestTelemetry,
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
    eventPipeline.dispose();
    await database.pool.end();
    process.exit(0);
  });
}

process.once("SIGINT", shutDown);
process.once("SIGTERM", shutDown);

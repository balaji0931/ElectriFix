import express from "express";

import type { IngestTelemetry } from "../application/ingest-telemetry.js";
import type { RunSimulation } from "../application/run-simulation.js";
import { errorHandler } from "./middleware/error-handler.js";
import {
  createHealthRouter,
  type DatabaseHealthCheck,
} from "./routes/health.routes.js";
import { createTelemetryRouter } from "./routes/telemetry.routes.js";
import { createSimulatorRouter } from "./routes/simulator.routes.js";

interface AppOptions {
  checkDatabase: DatabaseHealthCheck;
  startedAt: number;
  version: string;
  ingestTelemetry: IngestTelemetry;
  runSimulation?: RunSimulation;
}

export function createApp(options: AppOptions) {
  const app = express();

  app.use(express.json());
  app.use("/api", createHealthRouter(options));
  app.use("/api", createTelemetryRouter(options.ingestTelemetry));
  if (options.runSimulation) {
    app.use("/api", createSimulatorRouter(options.runSimulation));
  }
  app.use(errorHandler);

  return app;
}

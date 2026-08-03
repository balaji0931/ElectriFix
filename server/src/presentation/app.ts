import express from "express";

import type { IngestTelemetry } from "../application/ingest-telemetry.js";
import { errorHandler } from "./middleware/error-handler.js";
import {
  createHealthRouter,
  type DatabaseHealthCheck,
} from "./routes/health.routes.js";
import { createTelemetryRouter } from "./routes/telemetry.routes.js";

interface AppOptions {
  checkDatabase: DatabaseHealthCheck;
  startedAt: number;
  version: string;
  ingestTelemetry: IngestTelemetry;
}

export function createApp(options: AppOptions) {
  const app = express();

  app.use(express.json());
  app.use("/api", createHealthRouter(options));
  app.use("/api", createTelemetryRouter(options.ingestTelemetry));
  app.use(errorHandler);

  return app;
}

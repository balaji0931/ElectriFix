import express from "express";

import { errorHandler } from "./middleware/error-handler.js";
import {
  createHealthRouter,
  type DatabaseHealthCheck,
} from "./routes/health.routes.js";

interface AppOptions {
  checkDatabase: DatabaseHealthCheck;
  startedAt: number;
  version: string;
}

export function createApp(options: AppOptions) {
  const app = express();

  app.use("/api", createHealthRouter(options));
  app.use(errorHandler);

  return app;
}

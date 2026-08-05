import express from "express";

import type { IngestTelemetry } from "../application/ingest-telemetry.js";
import type { GetDashboardData } from "../application/get-dashboard-data.js";
import type { GetNetworkData } from "../application/get-network-data.js";
import type { ManageTicket } from "../application/manage-ticket.js";
import type { RunSimulation } from "../application/run-simulation.js";
import type { ProductPolicies } from "../config/policies.js";
import { errorHandler } from "./middleware/error-handler.js";
import {
  createHealthRouter,
  type DatabaseHealthCheck,
} from "./routes/health.routes.js";
import { createTelemetryRouter } from "./routes/telemetry.routes.js";
import { createFaultsRouter } from "./routes/faults.routes.js";
import { createTicketsRouter } from "./routes/tickets.routes.js";
import { createNetworkRouter } from "./routes/network.routes.js";
import { createScheduledOutagesRouter } from "./routes/scheduled-outages.routes.js";
import { createDashboardRouter } from "./routes/dashboard.routes.js";
import { createConfigRouter } from "./routes/config.routes.js";
import { createSimulatorRouter } from "./routes/simulator.routes.js";

interface AppOptions {
  checkDatabase: DatabaseHealthCheck;
  startedAt: number;
  version: string;
  ingestTelemetry: IngestTelemetry;
  runSimulation?: RunSimulation;
  api?: {
    dashboardData: GetDashboardData;
    networkData: GetNetworkData;
    manageTicket: ManageTicket;
    policies: ProductPolicies;
  };
}

export function createApp(options: AppOptions) {
  const app = express();

  app.use(express.json());
  app.use("/api", createHealthRouter(options));
  app.use("/api", createTelemetryRouter(options.ingestTelemetry));
  if (options.runSimulation) {
    app.use("/api", createSimulatorRouter(options.runSimulation));
  }
  if (options.api) {
    app.use("/api", createFaultsRouter(options.api.dashboardData));
    app.use(
      "/api",
      createTicketsRouter(options.api.dashboardData, options.api.manageTicket),
    );
    app.use("/api", createNetworkRouter(options.api.networkData));
    app.use("/api", createScheduledOutagesRouter(options.api.dashboardData));
    app.use("/api", createDashboardRouter(options.api.dashboardData));
    app.use("/api", createConfigRouter(options.api.policies));
  }
  app.use(errorHandler);

  return app;
}

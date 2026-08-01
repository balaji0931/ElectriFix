import { Router } from "express";

export type DatabaseHealthCheck = () => Promise<void>;

interface HealthRouteOptions {
  checkDatabase: DatabaseHealthCheck;
  startedAt: number;
  version: string;
}

export function createHealthRouter(options: HealthRouteOptions): Router {
  const router = Router();

  router.get("/health", async (_request, response, next) => {
    try {
      await options.checkDatabase();

      response.status(200).json({
        status: "healthy",
        database: "connected",
        uptime_seconds: Math.floor((Date.now() - options.startedAt) / 1000),
        version: options.version,
      });
    } catch {
      next({ statusCode: 503 });
    }
  });

  return router;
}

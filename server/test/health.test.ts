import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createApp } from "../src/presentation/app.js";

describe("GET /api/health", () => {
  it("reports a healthy connected database", async () => {
    const checkDatabase = vi.fn().mockResolvedValue(undefined);
    const app = createApp({
      checkDatabase,
      startedAt: Date.now() - 3_500,
      version: "1.0.0",
    });

    const response = await request(app).get("/api/health");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: "healthy",
      database: "connected",
      version: "1.0.0",
    });
    expect(response.body.uptime_seconds).toBeGreaterThanOrEqual(3);
    expect(checkDatabase).toHaveBeenCalledOnce();
  });

  it("returns service unavailable when the database cannot be reached", async () => {
    const app = createApp({
      checkDatabase: vi
        .fn()
        .mockRejectedValue(new Error("database unavailable")),
      startedAt: Date.now(),
      version: "1.0.0",
    });

    const response = await request(app).get("/api/health");

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      error: {
        code: "SERVICE_UNAVAILABLE",
        message: "Database is unavailable",
      },
    });
  });
});

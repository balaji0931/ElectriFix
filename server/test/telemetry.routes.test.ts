import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { PipelineBufferFullError } from "../src/infrastructure/event-pipeline.js";
import { createApp } from "../src/presentation/app.js";

const validEvent = {
  device_id: "DEV-001",
  pole_id: "P-001",
  event: "heartbeat",
  energized: true,
  ts: "2026-08-05T12:00:00.000Z",
  boot_counter: 1,
  seq: 1,
};

function createTestApp(
  ingest: ReturnType<typeof vi.fn>,
  ingestBatch = vi.fn(),
) {
  return createApp({
    checkDatabase: vi.fn(),
    startedAt: Date.now(),
    version: "1.0.0",
    ingestTelemetry: { ingest, ingestBatch } as never,
  });
}

describe("telemetry routes", () => {
  it("returns 202 after accepted single-event admission", async () => {
    const ingest = vi.fn().mockResolvedValue({ status: "accepted" });
    const response = await request(createTestApp(ingest))
      .post("/api/telemetry")
      .send(validEvent);

    expect(response.status).toBe(202);
    expect(response.body.status).toBe("accepted");
    expect(ingest).toHaveBeenCalledWith(validEvent);
  });

  it("returns 400 for schema failures, invalid enum values, and malformed JSON", async () => {
    const app = createTestApp(vi.fn());
    const invalid = await request(app).post("/api/telemetry").send({});
    const invalidEvent = await request(app)
      .post("/api/telemetry")
      .send({ ...validEvent, event: "invalid" });
    const malformed = await request(app)
      .post("/api/telemetry")
      .set("Content-Type", "application/json")
      .send("{");

    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe("BAD_REQUEST");
    expect(invalidEvent.status).toBe(400);
    expect(invalidEvent.body.error.code).toBe("BAD_REQUEST");
    expect(malformed.status).toBe(400);
    expect(malformed.body.error.code).toBe("BAD_REQUEST");
  });

  it("returns 422 for stale and business validation failures", async () => {
    const response = await request(
      createTestApp(vi.fn().mockResolvedValue({ status: "stale" })),
    )
      .post("/api/telemetry")
      .send(validEvent);

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns batch admission counts without waiting for processing", async () => {
    const ingestBatch = vi
      .fn()
      .mockResolvedValue([
        { status: "accepted" },
        { status: "duplicate" },
        { status: "stale" },
      ]);
    const response = await request(createTestApp(vi.fn(), ingestBatch))
      .post("/api/telemetry/batch")
      .send({
        events: [
          validEvent,
          { ...validEvent, seq: 2 },
          { ...validEvent, seq: 3 },
        ],
      });

    expect(response.status).toBe(202);
    expect(response.body).toMatchObject({
      accepted_count: 1,
      rejected_count: 2,
    });
  });

  it("enforces the documented batch limit", async () => {
    const response = await request(createTestApp(vi.fn()))
      .post("/api/telemetry/batch")
      .send({
        events: Array.from({ length: 501 }, (_, index) => ({
          ...validEvent,
          seq: index,
        })),
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("BAD_REQUEST");
  });

  it("returns 503 and PIPELINE_BUFFER_FULL when admission is overloaded", async () => {
    const response = await request(
      createTestApp(vi.fn().mockRejectedValue(new PipelineBufferFullError())),
    )
      .post("/api/telemetry")
      .send(validEvent);

    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe("PIPELINE_BUFFER_FULL");
  });
});

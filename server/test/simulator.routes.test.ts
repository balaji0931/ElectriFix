import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import {
  SimulationConflictError,
  SimulationNotFoundError,
} from "../src/application/run-simulation.js";
import {
  SimulationTargetNotFoundError,
  SimulationValidationError,
} from "../src/simulator/fault-injector.js";
import { createApp } from "../src/presentation/app.js";

describe("simulator routes", () => {
  it("exposes documented simulator commands and scenarios", async () => {
    const simulation = simulator();
    const app = createTestApp(simulation);

    await request(app)
      .post("/api/simulator/inject-fault")
      .send({ fault_type: "dt", target_id: "D-1" })
      .expect(202);
    await request(app)
      .post("/api/simulator/repair")
      .send({ fault_id: "018f8acb-0000-7000-8000-000000000101" })
      .expect(202);
    await request(app)
      .post("/api/simulator/inject-noise")
      .send({ noise_type: "duplicate_telemetry", target_pole_id: "P-1" })
      .expect(202);
    const scenarios = await request(app)
      .get("/api/simulator/scenarios")
      .expect(200);

    expect(simulation.injectFault).toHaveBeenCalledOnce();
    expect(simulation.repair).toHaveBeenCalledOnce();
    expect(simulation.injectNoise).toHaveBeenCalledOnce();
    expect(scenarios.body.fault_types).toEqual(["span", "dt", "feeder"]);
  });

  it("maps documented 404, 409, and 422 errors", async () => {
    const notFound = simulator();
    notFound.repair.mockRejectedValue(
      new SimulationNotFoundError("Fault not found"),
    );
    const conflict = simulator();
    conflict.injectFault.mockRejectedValue(
      new SimulationConflictError(
        "Active simulation already running for this target",
      ),
    );
    const invalid = simulator();
    invalid.injectFault.mockRejectedValue(
      new SimulationValidationError("Span faults require recorded topology"),
    );
    const unknownTarget = simulator();
    unknownTarget.injectFault.mockRejectedValue(
      new SimulationTargetNotFoundError(
        "Unknown distribution transformer target_id",
      ),
    );

    await request(createTestApp(notFound))
      .post("/api/simulator/repair")
      .send({ fault_id: "018f8acb-0000-7000-8000-000000000101" })
      .expect(404);
    await request(createTestApp(conflict))
      .post("/api/simulator/inject-fault")
      .send({ fault_type: "dt", target_id: "D-1" })
      .expect(409);
    await request(createTestApp(invalid))
      .post("/api/simulator/inject-fault")
      .send({ fault_type: "span", target_id: "D-1" })
      .expect(422);
    await request(createTestApp(unknownTarget))
      .post("/api/simulator/inject-fault")
      .send({ fault_type: "dt", target_id: "D-missing" })
      .expect(404);
  });
});

function simulator() {
  return {
    injectFault: vi.fn().mockResolvedValue({
      simulation_id: "018f8acb-0000-7000-8000-000000000001",
      status: "running",
    }),
    repair: vi.fn().mockResolvedValue({
      simulation_id: "018f8acb-0000-7000-8000-000000000002",
      status: "running",
    }),
    injectNoise: vi.fn().mockResolvedValue({
      simulation_id: "018f8acb-0000-7000-8000-000000000003",
      status: "running",
    }),
    scenarios: vi.fn().mockReturnValue({
      fault_types: ["span", "dt", "feeder"],
      noise_types: [],
      targets: { feeders: [], dts: [] },
    }),
  };
}
function createTestApp(runSimulation: ReturnType<typeof simulator>) {
  return createApp({
    checkDatabase: vi.fn(),
    startedAt: Date.now(),
    version: "test",
    ingestTelemetry: { ingest: vi.fn(), ingestBatch: vi.fn() } as never,
    runSimulation: runSimulation as never,
  });
}

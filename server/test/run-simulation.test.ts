import { describe, expect, it, vi } from "vitest";

import {
  RunSimulation,
  SimulationConflictError,
} from "../src/application/run-simulation.js";

describe("RunSimulation", () => {
  it("submits generated telemetry only through ingestion and completes after expected admissions", async () => {
    const ingest = {
      ingest: vi.fn().mockResolvedValue({ status: "accepted" }),
    };
    const publisher = { publish: vi.fn() };
    const simulation = new RunSimulation(
      ingest as never,
      { scenarios: () => ({}) } as never,
      {
        inject: () => ({
          faultType: "dt",
          targetId: "D-1",
          affectedPoleIds: ["P-1"],
          telemetry: [{ event: event(), expectedAdmission: "accepted" }],
          eventsDropped: 0,
        }),
      } as never,
      {} as never,
      {} as never,
      {} as never,
      publisher,
    );

    const receipt = await simulation.injectFault({
      faultType: "dt",
      targetId: "D-1",
      options: { power_lost_delivery_rate: 1 },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(receipt).toMatchObject({
      status: "running",
      expected_dark_poles: 1,
    });
    expect(ingest.ingest).toHaveBeenCalledWith(event());
    expect(publisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({ type: "simulation.started" }),
    );
    expect(publisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({ type: "simulation.completed" }),
    );
  });

  it("rejects a duplicate active target", async () => {
    let resolveAdmission: (() => void) | undefined;
    const simulation = new RunSimulation(
      {
        ingest: () =>
          new Promise((resolve) => {
            resolveAdmission = () => resolve({ status: "accepted" });
          }),
      } as never,
      { scenarios: () => ({}) } as never,
      {
        inject: () => ({
          faultType: "dt",
          targetId: "D-1",
          affectedPoleIds: [],
          telemetry: [{ event: event(), expectedAdmission: "accepted" }],
          eventsDropped: 0,
        }),
      } as never,
      {} as never,
      {} as never,
      {} as never,
      { publish() {} },
    );
    await simulation.injectFault({ faultType: "dt", targetId: "D-1" });
    await Promise.resolve();
    await expect(
      simulation.injectFault({ faultType: "dt", targetId: "D-1" }),
    ).rejects.toBeInstanceOf(SimulationConflictError);
    resolveAdmission?.();
  });
});

function event() {
  return {
    device_id: "DEV-1",
    pole_id: "P-1",
    event: "power_lost" as const,
    energized: false,
    ts: "2026-08-05T12:00:00.000Z",
    boot_counter: 1,
    seq: 1,
  };
}

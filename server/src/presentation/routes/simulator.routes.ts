import { Router, type NextFunction, type Response } from "express";

import {
  RunSimulation,
  SimulationConflictError,
  SimulationNotFoundError,
} from "../../application/run-simulation.js";
import {
  SimulationTargetNotFoundError,
  SimulationValidationError,
} from "../../simulator/fault-injector.js";
import {
  injectFaultRequestSchema,
  injectNoiseRequestSchema,
  repairFaultRequestSchema,
} from "../contracts/api.schemas.js";

export function createSimulatorRouter(runSimulation: RunSimulation) {
  const router = Router();
  router.post("/simulator/inject-fault", async (request, response, next) => {
    const parsed = injectFaultRequestSchema.safeParse(request.body);
    if (!parsed.success)
      return response
        .status(400)
        .json(error("BAD_REQUEST", "Simulator request validation failed"));
    try {
      return response.status(202).json(
        await runSimulation.injectFault({
          faultType: parsed.data.fault_type,
          targetId: parsed.data.target_id,
          spanPoleA: parsed.data.span_pole_a,
          spanPoleB: parsed.data.span_pole_b,
          options: parsed.data.options,
        }),
      );
    } catch (caught) {
      return handle(caught, response, next);
    }
  });
  router.post("/simulator/repair", async (request, response, next) => {
    const parsed = repairFaultRequestSchema.safeParse(request.body);
    if (!parsed.success)
      return response
        .status(400)
        .json(error("BAD_REQUEST", "Simulator request validation failed"));
    try {
      return response
        .status(202)
        .json(await runSimulation.repair(parsed.data.fault_id));
    } catch (caught) {
      return handle(caught, response, next);
    }
  });
  router.post("/simulator/inject-noise", async (request, response, next) => {
    const parsed = injectNoiseRequestSchema.safeParse(request.body);
    if (!parsed.success)
      return response
        .status(400)
        .json(error("BAD_REQUEST", "Simulator request validation failed"));
    try {
      return response.status(202).json(
        await runSimulation.injectNoise({
          noiseType: parsed.data.noise_type,
          targetPoleId: parsed.data.target_pole_id,
          options: parsed.data.options,
        }),
      );
    } catch (caught) {
      return handle(caught, response, next);
    }
  });
  router.get("/simulator/scenarios", (_request, response) =>
    response.json(runSimulation.scenarios()),
  );
  return router;
}
function handle(caught: unknown, response: Response, next: NextFunction) {
  if (caught instanceof SimulationTargetNotFoundError)
    return response.status(404).json(error("NOT_FOUND", caught.message));
  if (caught instanceof SimulationNotFoundError)
    return response.status(404).json(error("NOT_FOUND", caught.message));
  if (caught instanceof SimulationConflictError)
    return response.status(409).json(error("CONFLICT", caught.message));
  if (caught instanceof SimulationValidationError)
    return response.status(422).json(error("VALIDATION_ERROR", caught.message));
  return next(caught);
}
function error(code: string, message: string) {
  return { error: { code, message, timestamp: new Date().toISOString() } };
}

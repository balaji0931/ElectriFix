import { Router } from "express";

import type { IngestTelemetry } from "../../application/ingest-telemetry.js";
import {
  PipelineBufferFullError,
  type TelemetryAdmission,
} from "../../infrastructure/event-pipeline.js";
import {
  telemetryBatchRequestSchema,
  telemetryEventSchema,
} from "../contracts/api.schemas.js";

export function createTelemetryRouter(ingestTelemetry: IngestTelemetry) {
  const router = Router();

  router.post("/telemetry", async (request, response, next) => {
    const parsed = telemetryEventSchema.safeParse(request.body);
    if (!parsed.success) {
      return response.status(400).json(validationError(parsed.error.issues));
    }

    try {
      const admission = await ingestTelemetry.ingest(parsed.data);
      if (
        admission.status === "business_rejected" ||
        admission.status === "stale"
      ) {
        return response.status(422).json(businessError(admission));
      }
      return response.status(202).json(acceptedResponse());
    } catch (error) {
      if (error instanceof PipelineBufferFullError) {
        return response.status(503).json(bufferFullError());
      }
      return next(error);
    }
  });

  router.post("/telemetry/batch", async (request, response, next) => {
    const parsed = telemetryBatchRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return response.status(400).json(validationError(parsed.error.issues));
    }

    try {
      const admissions = await ingestTelemetry.ingestBatch(parsed.data.events);
      return response.status(202).json({
        status: "accepted",
        accepted_count: admissions.filter(
          (admission) => admission.status === "accepted",
        ).length,
        rejected_count: admissions.filter(
          (admission) => admission.status !== "accepted",
        ).length,
        received_at: new Date().toISOString(),
      });
    } catch (error) {
      if (error instanceof PipelineBufferFullError) {
        return response.status(503).json(bufferFullError());
      }
      return next(error);
    }
  });

  return router;
}

function acceptedResponse() {
  return { status: "accepted", received_at: new Date().toISOString() };
}

function validationError(
  issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>,
) {
  return {
    error: {
      code: "BAD_REQUEST",
      message: "Telemetry validation failed",
      details: issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
        value: null,
      })),
      timestamp: new Date().toISOString(),
    },
  };
}

function businessError(admission: TelemetryAdmission) {
  const message =
    admission.status === "stale"
      ? "Telemetry tuple is stale"
      : admission.status === "business_rejected"
        ? admission.message
        : "Telemetry business validation failed";
  return {
    error: {
      code: "VALIDATION_ERROR",
      message,
      timestamp: new Date().toISOString(),
    },
  };
}

function bufferFullError() {
  return {
    error: {
      code: "PIPELINE_BUFFER_FULL",
      message: "Telemetry pipeline buffer is full",
      timestamp: new Date().toISOString(),
    },
  };
}

import { Router } from "express";
import { z } from "zod";
import type { GetDashboardData } from "../../application/get-dashboard-data.js";
import { faultResponse } from "../api-serializers.js";
import { HttpError } from "../http-error.js";
import { page, pagination } from "./route-helpers.js";

const querySchema = z.object({
  status: z.enum(["active", "resolved", "merged", "all"]).optional(),
  dtId: z.string().optional(),
  feederId: z.string().optional(),
  confidence: z.enum(["HIGH", "MEDIUM", "LOW"]).optional(),
  since: z.iso.datetime().optional(),
});

export function createFaultsRouter(data: GetDashboardData) {
  const router = Router();
  router.get("/faults", async (request, response, next) => {
    try {
      const query = querySchema.safeParse(request.query);
      if (!query.success)
        throw new HttpError(400, "BAD_REQUEST", "Invalid fault query");
      const { limit, offset } = pagination(request.query);
      const since = query.data.since ? new Date(query.data.since) : undefined;
      const faults = (await data.listFaults())
        .filter(
          (fault) =>
            (query.data.status ?? "active") === "all" ||
            fault.status === (query.data.status ?? "active"),
        )
        .filter((fault) => !query.data.dtId || fault.dtId === query.data.dtId)
        .filter(
          (fault) =>
            !query.data.feederId || fault.feederId === query.data.feederId,
        )
        .filter(
          (fault) =>
            !query.data.confidence ||
            fault.confidenceLevel === query.data.confidence,
        )
        .filter((fault) => !since || fault.detectedAt > since)
        .sort(
          (left, right) =>
            right.detectedAt.getTime() - left.detectedAt.getTime(),
        );
      return response.json(page(faults.map(faultResponse), limit, offset));
    } catch (error) {
      return next(error);
    }
  });
  router.get("/faults/:faultId", async (request, response, next) => {
    try {
      const fault = await data.findFault(request.params.faultId);
      if (!fault) throw new HttpError(404, "NOT_FOUND", "Fault not found");
      return response.json(faultResponse(fault));
    } catch (error) {
      return next(error);
    }
  });
  return router;
}

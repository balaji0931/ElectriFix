import { Router } from "express";
import type { GetDashboardData } from "../../application/get-dashboard-data.js";
import { HttpError } from "../http-error.js";

export function createScheduledOutagesRouter(data: GetDashboardData) {
  const router = Router();
  router.get("/scheduled-outages", async (request, response, next) => {
    try {
      const from = request.query.from
        ? new Date(String(request.query.from))
        : undefined;
      const to = request.query.to
        ? new Date(String(request.query.to))
        : undefined;
      if (
        (from && Number.isNaN(from.getTime())) ||
        (to && Number.isNaN(to.getTime()))
      )
        throw new HttpError(400, "BAD_REQUEST", "Invalid outage time range");
      const scope = request.query.scope;
      if (scope && scope !== "dt" && scope !== "feeder")
        throw new HttpError(400, "BAD_REQUEST", "Invalid outage scope");
      const now = new Date();
      const outages = (await data.listOutages())
        .filter((outage) => !scope || outage.scope === scope)
        .filter((outage) => !from || outage.scheduledEnd >= from)
        .filter((outage) => !to || outage.scheduledStart <= to)
        .map((outage) => ({
          outage_id: outage.outageId,
          scope: outage.scope,
          target_id: outage.targetId,
          scheduled_start: outage.scheduledStart.toISOString(),
          scheduled_end: outage.scheduledEnd.toISOString(),
          reason: outage.reason,
          is_active: outage.scheduledStart <= now && now <= outage.scheduledEnd,
        }));
      return response.json({ data: outages });
    } catch (error) {
      return next(error);
    }
  });
  return router;
}

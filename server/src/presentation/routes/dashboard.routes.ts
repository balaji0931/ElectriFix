import { Router } from "express";
import type { GetDashboardData } from "../../application/get-dashboard-data.js";
import { faultSummary } from "../api-serializers.js";

export function createDashboardRouter(data: GetDashboardData) {
  const router = Router();
  router.get("/dashboard/summary", async (_request, response, next) => {
    try {
      const summary = await data.summary(new Date());
      return response.json({
        active_faults: summary.activeFaults,
        open_tickets: summary.openTickets,
        tickets_by_status: summary.ticketsByStatus,
        network_status: {
          total_poles: summary.networkStatus.totalPoles,
          live_poles: summary.networkStatus.livePoles,
          dark_poles: summary.networkStatus.darkPoles,
          presumed_dark_poles: summary.networkStatus.presumedDarkPoles,
          unknown_poles: summary.networkStatus.unknownPoles,
          dead_sensors: summary.networkStatus.deadSensors,
          active_outages: summary.networkStatus.activeOutages,
        },
        recent_faults: summary.recentFaults.map(faultSummary),
        timestamp: summary.timestamp.toISOString(),
      });
    } catch (error) {
      return next(error);
    }
  });
  return router;
}

import { Router, type RequestHandler } from "express";
import { z } from "zod";
import { GetDashboardData } from "../../application/get-dashboard-data.js";
import {
  ManageTicket,
  TicketNotFoundError,
} from "../../application/manage-ticket.js";
import { TicketLifecycleError } from "../../domain/ticket/ticket-lifecycle.js";
import { ticketActionResponse, ticketResponse } from "../api-serializers.js";
import { HttpError } from "../http-error.js";
import {
  assignTicketRequestSchema,
  ticketActionRequestSchema,
} from "../contracts/api.schemas.js";
import { page, pagination } from "./route-helpers.js";
import type { TicketPersistenceModel } from "../../infrastructure/repositories/ticket-repository.js";

const querySchema = z.object({
  status: z
    .enum([
      "detected",
      "acknowledged",
      "crew_assigned",
      "resolved",
      "verified",
      "closed",
      "open",
    ])
    .optional(),
  feederId: z.string().optional(),
  since: z.iso.datetime().optional(),
});

export function createTicketsRouter(
  data: GetDashboardData,
  manageTicket: ManageTicket,
) {
  const router = Router();
  router.get("/tickets", async (request, response, next) => {
    try {
      const query = querySchema.safeParse(request.query);
      if (!query.success)
        throw new HttpError(400, "BAD_REQUEST", "Invalid ticket query");
      const { limit, offset } = pagination(request.query);
      const since = query.data.since ? new Date(query.data.since) : undefined;
      const tickets = (await data.listTickets())
        .filter(
          (record) =>
            !query.data.feederId ||
            record.fault.feederId === query.data.feederId,
        )
        .filter((record) => !since || record.ticket.detectedAt > since)
        .filter(
          (record) =>
            query.data.status === undefined ||
            (query.data.status === "open"
              ? ["detected", "acknowledged", "crew_assigned"].includes(
                  record.ticket.status,
                )
              : record.ticket.status === query.data.status),
        )
        .sort(
          (left, right) =>
            right.ticket.detectedAt.getTime() -
            left.ticket.detectedAt.getTime(),
        );
      return response.json(
        page(
          tickets.map((record) => ticketResponse(record)),
          limit,
          offset,
        ),
      );
    } catch (error) {
      return next(error);
    }
  });
  router.get("/tickets/:ticketId", async (request, response, next) => {
    try {
      const ticket = await data.findTicket(request.params.ticketId);
      if (!ticket) throw new HttpError(404, "NOT_FOUND", "Ticket not found");
      return response.json(ticketResponse(ticket, true));
    } catch (error) {
      return next(error);
    }
  });
  router.patch(
    "/tickets/:ticketId/acknowledge",
    action(ticketActionRequestSchema, (id, body) =>
      manageTicket.acknowledge(id, {
        occurredAt: new Date(),
        operatorNotes: body.operator_notes,
      }),
    ),
  );
  router.patch(
    "/tickets/:ticketId/assign",
    action(assignTicketRequestSchema, (id, body) =>
      manageTicket.assign(id, {
        occurredAt: new Date(),
        assignedCrew: body.assigned_crew,
        operatorNotes: body.operator_notes,
      }),
    ),
  );
  router.patch(
    "/tickets/:ticketId/resolve",
    action(ticketActionRequestSchema, (id, body) =>
      manageTicket.resolve(id, {
        occurredAt: new Date(),
        operatorNotes: body.operator_notes,
      }),
    ),
  );
  return router;
}

function action<T>(
  schema: z.ZodType<T>,
  invoke: (ticketId: string, body: T) => Promise<TicketPersistenceModel>,
): RequestHandler {
  return async (request, response, next) => {
    const parsed = schema.safeParse(request.body ?? {});
    if (!parsed.success)
      return next(new HttpError(400, "BAD_REQUEST", "Invalid ticket request"));
    try {
      return response.json(
        ticketActionResponse(
          await invoke(String(request.params.ticketId), parsed.data),
        ),
      );
    } catch (error) {
      if (error instanceof TicketNotFoundError)
        return next(new HttpError(404, "NOT_FOUND", error.message));
      if (error instanceof TicketLifecycleError)
        return next(new HttpError(409, "CONFLICT", error.message));
      return next(error);
    }
  };
}

import type { Database } from "../db/client.js";
import { faults, tickets } from "../db/schema.js";

export type FaultPersistenceInput = typeof faults.$inferInsert;
export type FaultPersistenceModel = typeof faults.$inferSelect;
export type TicketPersistenceInput = typeof tickets.$inferInsert;
export type TicketPersistenceModel = typeof tickets.$inferSelect;

export interface CreatedFaultAndTicket {
  fault: FaultPersistenceModel;
  ticket: TicketPersistenceModel;
}

export class TicketRepository {
  constructor(private readonly db: Database) {}

  async createFaultAndTicket(
    fault: FaultPersistenceInput,
    ticket: TicketPersistenceInput,
  ): Promise<CreatedFaultAndTicket> {
    return this.db.transaction(async (transaction) => {
      const [createdFault] = await transaction
        .insert(faults)
        .values(fault)
        .returning();
      const [createdTicket] = await transaction
        .insert(tickets)
        .values(ticket)
        .returning();

      if (!createdFault || !createdTicket) {
        throw new Error("Fault and ticket inserts must return created rows");
      }

      return { fault: createdFault, ticket: createdTicket };
    });
  }
}

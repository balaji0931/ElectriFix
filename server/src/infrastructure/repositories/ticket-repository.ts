import { and, eq, inArray, isNull } from "drizzle-orm";

import type { FaultType, TopologySource } from "../../domain/contracts.js";
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

export type ActiveFaultIdentity =
  | {
      readonly faultType: "span";
      readonly dtId: string;
      readonly spanPoleA: string;
      readonly spanPoleB: string;
    }
  | {
      readonly faultType: "dt";
      readonly dtId: string;
      readonly topologySource?: "FALLBACK";
    }
  | {
      readonly faultType: "feeder";
      readonly feederId: string;
    };

export interface ActiveFaultUpdate {
  readonly affectedPoleCount: number;
  readonly confidenceLevel: "HIGH" | "MEDIUM" | "LOW";
  readonly updatedAt: Date;
}

export interface TicketWithFault {
  readonly ticket: TicketPersistenceModel;
  readonly fault: FaultPersistenceModel;
}

export type TicketPersistenceUpdate = Partial<
  Omit<
    TicketPersistenceInput,
    "ticketId" | "faultId" | "detectedAt" | "createdAt"
  >
>;

export interface VerifiedTicketAndFault {
  readonly ticket: TicketPersistenceModel;
  readonly fault: FaultPersistenceModel;
}

export class TicketRepository {
  constructor(private readonly db: Database) {}

  async findActiveFault(
    identity: ActiveFaultIdentity,
  ): Promise<FaultPersistenceModel | undefined> {
    const conditions = [
      eq(faults.status, "active"),
      eq(faults.faultType, identity.faultType satisfies FaultType),
    ];

    if (identity.faultType === "span") {
      conditions.push(
        eq(faults.dtId, identity.dtId),
        eq(faults.spanPoleA, identity.spanPoleA),
        eq(faults.spanPoleB, identity.spanPoleB),
      );
    } else if (identity.faultType === "dt") {
      conditions.push(eq(faults.dtId, identity.dtId));
      if (identity.topologySource) {
        conditions.push(
          eq(
            faults.topologySource,
            identity.topologySource satisfies TopologySource,
          ),
        );
      }
    } else {
      conditions.push(eq(faults.feederId, identity.feederId));
      conditions.push(isNull(faults.spanPoleA), isNull(faults.spanPoleB));
    }

    const [fault] = await this.db
      .select()
      .from(faults)
      .where(and(...conditions))
      .limit(1);

    return fault;
  }

  async updateActiveFault(
    faultId: string,
    update: ActiveFaultUpdate,
  ): Promise<FaultPersistenceModel | undefined> {
    const [fault] = await this.db
      .update(faults)
      .set(update)
      .where(and(eq(faults.faultId, faultId), eq(faults.status, "active")))
      .returning();

    return fault;
  }

  async updateFaultAiSummary(
    faultId: string,
    aiSummary: string,
    updatedAt: Date,
  ): Promise<FaultPersistenceModel | undefined> {
    const [fault] = await this.db
      .update(faults)
      .set({ aiSummary, updatedAt })
      .where(and(eq(faults.faultId, faultId), isNull(faults.aiSummary)))
      .returning();

    return fault;
  }

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

  async findTicketWithFault(
    ticketId: string,
  ): Promise<TicketWithFault | undefined> {
    const [result] = await this.db
      .select({ ticket: tickets, fault: faults })
      .from(tickets)
      .innerJoin(faults, eq(tickets.faultId, faults.faultId))
      .where(eq(tickets.ticketId, ticketId))
      .limit(1);

    return result;
  }

  async findFaultById(
    faultId: string,
  ): Promise<FaultPersistenceModel | undefined> {
    const [fault] = await this.db
      .select()
      .from(faults)
      .where(eq(faults.faultId, faultId))
      .limit(1);
    return fault;
  }

  listFaults(): Promise<FaultPersistenceModel[]> {
    return this.db.select().from(faults);
  }

  listTicketsWithFaults(): Promise<TicketWithFault[]> {
    return this.db
      .select({ ticket: tickets, fault: faults })
      .from(tickets)
      .innerJoin(faults, eq(tickets.faultId, faults.faultId));
  }

  async listRestorableTicketsWithFaults(): Promise<
    ReadonlyArray<TicketWithFault>
  > {
    return this.db
      .select({ ticket: tickets, fault: faults })
      .from(tickets)
      .innerJoin(faults, eq(tickets.faultId, faults.faultId))
      .where(
        and(
          eq(faults.status, "active"),
          inArray(tickets.status, [
            "detected",
            "acknowledged",
            "crew_assigned",
            "resolved",
          ]),
        ),
      );
  }

  async updateTicket(
    ticketId: string,
    update: TicketPersistenceUpdate,
  ): Promise<TicketPersistenceModel | undefined> {
    const [ticket] = await this.db
      .update(tickets)
      .set(update)
      .where(eq(tickets.ticketId, ticketId))
      .returning();

    return ticket;
  }

  async verifyTicketAndResolveFault(
    ticketId: string,
    faultId: string,
    ticketUpdate: TicketPersistenceUpdate,
    verifiedAt: Date,
  ): Promise<VerifiedTicketAndFault> {
    return this.db.transaction(async (transaction) => {
      const [ticket] = await transaction
        .update(tickets)
        .set(ticketUpdate)
        .where(eq(tickets.ticketId, ticketId))
        .returning();
      const [fault] = await transaction
        .update(faults)
        .set({
          status: "resolved",
          resolvedAt: verifiedAt,
          updatedAt: verifiedAt,
        })
        .where(and(eq(faults.faultId, faultId), eq(faults.status, "active")))
        .returning();

      if (!ticket || !fault) {
        throw new Error(
          "Ticket verification requires an active fault and ticket",
        );
      }

      return { ticket, fault };
    });
  }
}

import { and, eq, isNull } from "drizzle-orm";

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

import type { StartupSnapshot } from "../infrastructure/db/bootstrap.js";
import type {
  FaultPersistenceModel,
  TicketWithFault,
} from "../infrastructure/repositories/ticket-repository.js";
import type { PoleState } from "../domain/pole-state/types.js";

export interface DashboardDataStore {
  listFaults(): Promise<ReadonlyArray<FaultPersistenceModel>>;
  findFaultById(faultId: string): Promise<FaultPersistenceModel | undefined>;
  listTicketsWithFaults(): Promise<ReadonlyArray<TicketWithFault>>;
  findTicketWithFault(ticketId: string): Promise<TicketWithFault | undefined>;
}

export interface ScheduledOutageReader {
  listScheduledOutages(): Promise<
    ReadonlyArray<{
      outageId: string;
      scope: "feeder" | "dt";
      targetId: string;
      scheduledStart: Date;
      scheduledEnd: Date;
      reason: string | null;
    }>
  >;
}

export interface PoleStatesReader {
  getPoleStates(): ReadonlyArray<PoleState>;
}

export class GetDashboardData {
  constructor(
    private readonly store: DashboardDataStore,
    private readonly poleStateReader: PoleStatesReader,
    private readonly snapshot: StartupSnapshot,
    private readonly outageReader: ScheduledOutageReader,
  ) {}

  async listFaults(): Promise<ReadonlyArray<FaultPersistenceModel>> {
    return this.store.listFaults();
  }

  findFault(faultId: string): Promise<FaultPersistenceModel | undefined> {
    return this.store.findFaultById(faultId);
  }

  async listTickets(): Promise<ReadonlyArray<TicketWithFault>> {
    return this.store.listTicketsWithFaults();
  }

  findTicket(ticketId: string): Promise<TicketWithFault | undefined> {
    return this.store.findTicketWithFault(ticketId);
  }

  listOutages() {
    return this.outageReader.listScheduledOutages();
  }

  async summary(now: Date) {
    const [faults, tickets, outages] = await Promise.all([
      this.store.listFaults(),
      this.store.listTicketsWithFaults(),
      this.outageReader.listScheduledOutages(),
    ]);
    const states = this.poleStateReader.getPoleStates();
    const byStatus = Object.fromEntries(
      ["detected", "acknowledged", "crew_assigned", "resolved", "verified"].map(
        (status) => [
          status,
          tickets.filter((record) => record.ticket.status === status).length,
        ],
      ),
    );
    return Object.freeze({
      activeFaults: faults.filter((fault) => fault.status === "active").length,
      openTickets: tickets.filter((record) =>
        ["detected", "acknowledged", "crew_assigned"].includes(
          record.ticket.status,
        ),
      ).length,
      ticketsByStatus: byStatus,
      networkStatus: {
        totalPoles: this.snapshot.poles.length,
        livePoles: states.filter((state) => state.energized === "LIVE").length,
        darkPoles: states.filter((state) => state.energized === "DARK").length,
        presumedDarkPoles: states.filter(
          (state) => state.energized === "PRESUMED_DARK",
        ).length,
        unknownPoles: states.filter((state) => state.energized === "UNKNOWN")
          .length,
        deadSensors: states.filter((state) => state.deviceHealth === "OFFLINE")
          .length,
        activeOutages: outages.filter(
          (outage) =>
            outage.scheduledStart <= now && now <= outage.scheduledEnd,
        ).length,
      },
      recentFaults: faults
        .slice()
        .sort(
          (left, right) =>
            right.detectedAt.getTime() - left.detectedAt.getTime(),
        )
        .slice(0, 5),
      timestamp: now,
    });
  }
}

import type { FaultEvidence, TicketStatus } from "../domain/contracts.js";
import { RestorationVerifier } from "../domain/ticket/restoration-verifier.js";
import { TicketLifecycle } from "../domain/ticket/ticket-lifecycle.js";
import type { TicketLifecycleState } from "../domain/ticket/types.js";
import type { PoleStateTransition } from "../domain/pole-state/types.js";
import type {
  FaultPersistenceModel,
  TicketPersistenceModel,
  TicketPersistenceUpdate,
  TicketWithFault,
  VerifiedTicketAndFault,
} from "../infrastructure/repositories/ticket-repository.js";
import type {
  LocalizationEventPublisher,
  PoleStateReader,
} from "./localize-faults.js";

export interface TicketLifecycleStore {
  findTicketWithFault(ticketId: string): Promise<TicketWithFault | undefined>;
  listRestorableTicketsWithFaults(): Promise<ReadonlyArray<TicketWithFault>>;
  updateTicket(
    ticketId: string,
    update: TicketPersistenceUpdate,
  ): Promise<TicketPersistenceModel | undefined>;
  verifyTicketAndResolveFault(
    ticketId: string,
    faultId: string,
    ticketUpdate: TicketPersistenceUpdate,
    verifiedAt: Date,
  ): Promise<VerifiedTicketAndFault>;
}

export interface ManageTicketDependencies {
  readonly ticketStore: TicketLifecycleStore;
  readonly poleStateReader: PoleStateReader;
  readonly ticketLifecycle: TicketLifecycle;
  readonly restorationVerifier: RestorationVerifier;
  readonly publisher: LocalizationEventPublisher;
}

export interface OperatorTicketCommand {
  readonly occurredAt: Date;
  readonly operatorNotes?: string;
}

export interface AssignTicketCommand extends OperatorTicketCommand {
  readonly assignedCrew: string;
}

/** Coordinates ticket-state persistence with pure lifecycle and verification rules. */
export class ManageTicket {
  constructor(private readonly dependencies: ManageTicketDependencies) {}

  async acknowledge(
    ticketId: string,
    command: OperatorTicketCommand,
  ): Promise<TicketPersistenceModel> {
    const record = await this.requireTicket(ticketId);
    const update = this.dependencies.ticketLifecycle.acknowledge(
      toLifecycleState(record.ticket),
      command.occurredAt,
      command.operatorNotes,
    );
    return this.persistTicketUpdate(record.ticket, update);
  }

  async assign(
    ticketId: string,
    command: AssignTicketCommand,
  ): Promise<TicketPersistenceModel> {
    const record = await this.requireTicket(ticketId);
    const update = this.dependencies.ticketLifecycle.assign(
      toLifecycleState(record.ticket),
      command.occurredAt,
      command.assignedCrew,
      command.operatorNotes,
    );
    return this.persistTicketUpdate(record.ticket, update);
  }

  async resolve(
    ticketId: string,
    command: OperatorTicketCommand,
  ): Promise<TicketPersistenceModel> {
    const record = await this.requireTicket(ticketId);
    const resolved = this.dependencies.ticketLifecycle.resolve(
      toLifecycleState(record.ticket),
      command.occurredAt,
      command.operatorNotes,
    );
    const verification = this.verify(record.fault);

    if (verification.verified) {
      const verified = this.dependencies.ticketLifecycle.verify(
        applyLifecycleUpdate(toLifecycleState(record.ticket), resolved),
        verification,
        command.occurredAt,
      );
      return this.persistVerified(record, verified, command.occurredAt);
    }

    const rejection = this.dependencies.ticketLifecycle.rejectResolution(
      applyLifecycleUpdate(toLifecycleState(record.ticket), resolved),
      command.occurredAt,
      rejectionReason(verification),
    );
    return this.persistTicketUpdate(record.ticket, rejection);
  }

  async handlePoleStateTransition(
    transition: PoleStateTransition,
  ): Promise<void> {
    if (!isRestorationTransition(transition)) {
      return;
    }

    const records =
      await this.dependencies.ticketStore.listRestorableTicketsWithFaults();
    for (const record of records) {
      if (
        !affectedPoleIds(record.fault).includes(transition.currentState.poleId)
      ) {
        continue;
      }
      const verification = this.verify(record.fault);
      if (!verification.verified) {
        continue;
      }
      const verified = this.dependencies.ticketLifecycle.verify(
        toLifecycleState(record.ticket),
        verification,
        transition.currentState.updatedAt,
      );
      await this.persistVerified(
        record,
        verified,
        transition.currentState.updatedAt,
      );
    }
  }

  private verify(fault: FaultPersistenceModel) {
    const poleIds = affectedPoleIds(fault);
    const poleStates = poleIds.map((poleId) => {
      const state = this.dependencies.poleStateReader.getPoleState(poleId);
      if (!state) {
        throw new Error(
          `Pole state is unavailable for affected pole ${poleId}`,
        );
      }
      return state;
    });
    return this.dependencies.restorationVerifier.verify({
      affectedPoleIds: poleIds,
      poleStates,
    });
  }

  private async requireTicket(ticketId: string): Promise<TicketWithFault> {
    const record =
      await this.dependencies.ticketStore.findTicketWithFault(ticketId);
    if (!record) {
      throw new Error(`Ticket ${ticketId} was not found`);
    }
    return record;
  }

  private async persistTicketUpdate(
    previous: TicketPersistenceModel,
    update: TicketPersistenceUpdate,
  ): Promise<TicketPersistenceModel> {
    const ticket = await this.dependencies.ticketStore.updateTicket(
      previous.ticketId,
      update,
    );
    if (!ticket) {
      throw new Error(`Ticket ${previous.ticketId} disappeared during update`);
    }
    this.publishTicketUpdate(previous.status, ticket);
    return ticket;
  }

  private async persistVerified(
    record: TicketWithFault,
    update: TicketPersistenceUpdate,
    verifiedAt: Date,
  ): Promise<TicketPersistenceModel> {
    const result =
      await this.dependencies.ticketStore.verifyTicketAndResolveFault(
        record.ticket.ticketId,
        record.fault.faultId,
        update,
        verifiedAt,
      );
    this.publishTicketUpdate(record.ticket.status, result.ticket);
    this.dependencies.publisher.publish(
      Object.freeze({ type: "fault.updated", fault: result.fault }),
    );
    return result.ticket;
  }

  private publishTicketUpdate(
    previousStatus: TicketPersistenceModel["status"],
    ticket: TicketPersistenceModel,
  ): void {
    this.dependencies.publisher.publish(
      Object.freeze({
        type: "ticket.updated",
        ticket,
        previousStatus: previousStatus as TicketStatus,
      }),
    );
  }
}

function toLifecycleState(
  ticket: TicketPersistenceModel,
): TicketLifecycleState {
  return Object.freeze({
    ticketId: ticket.ticketId,
    status: ticket.status as TicketLifecycleState["status"],
    assignedCrew: ticket.assignedCrew,
    operatorNotes: ticket.operatorNotes,
    rejectionCount: ticket.rejectionCount,
    rejectionReason: ticket.rejectionReason,
    acknowledgedAt: cloneNullableDate(ticket.acknowledgedAt),
    crewAssignedAt: cloneNullableDate(ticket.crewAssignedAt),
    resolvedAt: cloneNullableDate(ticket.resolvedAt),
    verifiedAt: cloneNullableDate(ticket.verifiedAt),
    closedAt: cloneNullableDate(ticket.closedAt),
    updatedAt: cloneDate(ticket.updatedAt),
  });
}

function applyLifecycleUpdate(
  ticket: TicketLifecycleState,
  update: TicketPersistenceUpdate,
): TicketLifecycleState {
  return Object.freeze({
    ...ticket,
    ...update,
    updatedAt: cloneDate(update.updatedAt ?? ticket.updatedAt),
  }) as TicketLifecycleState;
}

function affectedPoleIds(fault: FaultPersistenceModel): readonly string[] {
  const evidence = fault.evidence as unknown as FaultEvidence;
  if (!Array.isArray(evidence.affected_poles)) {
    throw new Error(
      `Fault ${fault.faultId} has invalid affected pole evidence`,
    );
  }
  return Object.freeze([...evidence.affected_poles]);
}

function isRestorationTransition(transition: PoleStateTransition): boolean {
  return (
    (transition.previousState.energized === "DARK" ||
      transition.previousState.energized === "PRESUMED_DARK") &&
    transition.currentState.energized === "LIVE"
  );
}

function rejectionReason(verification: {
  readonly liveMonitoredPoleCount: number;
  readonly monitoredPoleCount: number;
}): string {
  const darkMonitoredPoleCount =
    verification.monitoredPoleCount - verification.liveMonitoredPoleCount;
  return `${darkMonitoredPoleCount} of ${verification.monitoredPoleCount} affected poles still dark.`;
}

function cloneDate(value: Date): Date {
  return new Date(value.getTime());
}

function cloneNullableDate(value: Date | null): Date | null {
  return value === null ? null : cloneDate(value);
}

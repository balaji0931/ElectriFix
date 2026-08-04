import type { TicketStatus } from "../contracts.js";
import type { PoleState } from "../pole-state/types.js";

export interface TicketLifecycleState {
  readonly ticketId: string;
  readonly status: TicketStatus;
  readonly assignedCrew: string | null;
  readonly operatorNotes: string | null;
  readonly rejectionCount: number;
  readonly rejectionReason: string | null;
  readonly acknowledgedAt: Date | null;
  readonly crewAssignedAt: Date | null;
  readonly resolvedAt: Date | null;
  readonly verifiedAt: Date | null;
  readonly closedAt: Date | null;
  readonly updatedAt: Date;
}

export interface TicketLifecycleUpdate {
  readonly status: TicketStatus;
  readonly assignedCrew?: string | null;
  readonly operatorNotes?: string | null;
  readonly rejectionCount?: number;
  readonly rejectionReason?: string | null;
  readonly acknowledgedAt?: Date | null;
  readonly crewAssignedAt?: Date | null;
  readonly resolvedAt?: Date | null;
  readonly verifiedAt?: Date | null;
  readonly updatedAt: Date;
}

export interface RestorationVerificationInput {
  readonly affectedPoleIds: readonly string[];
  readonly poleStates: readonly PoleState[];
}

export interface RestorationVerificationResult {
  readonly verified: boolean;
  readonly liveMonitoredPoleCount: number;
  readonly monitoredPoleCount: number;
}

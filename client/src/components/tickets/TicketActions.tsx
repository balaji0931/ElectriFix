import { useState } from "react";

import { ApiError, type Ticket } from "../../lib/types";
import { useTicketActions } from "../../hooks/useTicketActions";

export function TicketActions({ ticket }: { readonly ticket: Ticket }) {
  const actions = useTicketActions();
  const [crew, setCrew] = useState("");
  const [notes, setNotes] = useState("");
  const error =
    actions.acknowledge.error ?? actions.assign.error ?? actions.resolve.error;
  const nextAction =
    ticket.status === "detected"
      ? "Acknowledge incident"
      : ticket.status === "acknowledged"
        ? "Assign a crew"
        : ticket.status === "crew_assigned"
          ? "Record crew resolution"
          : ticket.status === "resolved"
            ? "Await telemetry verification"
            : ticket.status === "verified"
              ? "Verified from telemetry"
              : "No operator action";

  return (
    <div className="ticket-actions">
      <p className="next-action">
        <span>Next action</span>
        <strong>{nextAction}</strong>
      </p>
      <label>
        Operator notes
        <textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Optional context for the ticket"
        />
      </label>
      {ticket.status === "detected" && (
        <button
          className="command-button"
          disabled={actions.acknowledge.isPending}
          onClick={() =>
            actions.acknowledge.mutate({ ticketId: ticket.ticket_id, notes })
          }
        >
          Acknowledge
        </button>
      )}
      {ticket.status === "acknowledged" && (
        <>
          <label>
            Assigned crew
            <input
              value={crew}
              onChange={(event) => setCrew(event.target.value)}
              placeholder="Crew name"
            />
          </label>
          <button
            className="command-button"
            disabled={!crew.trim() || actions.assign.isPending}
            onClick={() =>
              actions.assign.mutate({
                ticketId: ticket.ticket_id,
                crew: crew.trim(),
                notes,
              })
            }
          >
            Assign crew
          </button>
        </>
      )}
      {ticket.status === "crew_assigned" && (
        <button
          className="command-button"
          disabled={actions.resolve.isPending}
          onClick={() =>
            actions.resolve.mutate({ ticketId: ticket.ticket_id, notes })
          }
        >
          Mark resolved
        </button>
      )}
      {error && (
        <p className="command-error" role="alert">
          {formatError(error)}
        </p>
      )}
      {ticket.rejection_reason && (
        <p className="rejection-note">
          <strong>Verification rejected:</strong> {ticket.rejection_reason}
        </p>
      )}
    </div>
  );
}

function formatError(error: Error) {
  return error instanceof ApiError && error.status === 409
    ? `The server rejected this transition: ${error.message}`
    : error.message;
}

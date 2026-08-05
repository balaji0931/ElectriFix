import { TicketActions } from "./TicketActions";
import type { Ticket } from "../../lib/types";

export function TicketDetail({ ticket }: { readonly ticket: Ticket | null }) {
  if (!ticket)
    return (
      <section className="detail-empty">
        Select a ticket to manage the operator workflow.
      </section>
    );
  return (
    <section className="ticket-detail" aria-label="Ticket detail">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Ticket</p>
          <h2>{ticket.status.replace("_", " ")}</h2>
        </div>
        <span className="ticket-id">{ticket.ticket_id.slice(0, 8)}</span>
      </div>
      <dl className="ticket-metadata">
        <div>
          <dt>Fault</dt>
          <dd>
            {ticket.fault.fault_type.toUpperCase()} · {ticket.fault.dt_id}
          </dd>
        </div>
        <div>
          <dt>Assigned crew</dt>
          <dd>{ticket.assigned_crew ?? "Unassigned"}</dd>
        </div>
        <div>
          <dt>Detected</dt>
          <dd>{new Date(ticket.detected_at).toLocaleString()}</dd>
        </div>
        <div>
          <dt>Rejections</dt>
          <dd>{ticket.rejection_count}</dd>
        </div>
      </dl>
      <TicketActions ticket={ticket} />
    </section>
  );
}

import type { Ticket } from "../../lib/types";

export function TicketList({
  tickets,
  selectedTicketId,
  onSelect,
}: {
  readonly tickets: Ticket[];
  readonly selectedTicketId: string | null;
  readonly onSelect: (ticketId: string) => void;
}) {
  return (
    <section className="ticket-list" aria-label="Open tickets">
      <div className="panel-heading">
        <h2>Open tickets</h2>
        <span>{tickets.length}</span>
      </div>
      <div className="ticket-list__items">
        {tickets.length === 0 ? (
          <p className="empty-list">No open tickets.</p>
        ) : (
          tickets.map((ticket) => (
            <button
              className="ticket-row"
              data-selected={ticket.ticket_id === selectedTicketId}
              key={ticket.ticket_id}
              onClick={() => onSelect(ticket.ticket_id)}
            >
              <span className="ticket-row__topline">
                <strong>{ticket.status.replace("_", " ")}</strong>
                <span>{ticket.fault.confidence_level}</span>
              </span>
              <span>
                {ticket.fault.fault_type.toUpperCase()} · {ticket.fault.dt_id}
              </span>
              <small>
                {ticket.fault.affected_pole_count} poles · PIN{" "}
                {ticket.fault.pincode ?? "unknown"}
              </small>
            </button>
          ))
        )}
      </div>
    </section>
  );
}

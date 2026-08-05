import type { DashboardSummary } from "../../lib/types";

export function StatusBar({
  summary,
}: {
  readonly summary?: DashboardSummary;
}) {
  const status = summary?.network_status;
  const metrics = [
    ["Active faults", summary?.active_faults ?? "-"],
    ["Open tickets", summary?.open_tickets ?? "-"],
    ["Dark poles", status?.dark_poles ?? "-"],
    ["Planned outages", status?.active_outages ?? "-"],
  ];
  return (
    <section className="status-bar" aria-label="Network summary">
      {metrics.map(([label, value]) => (
        <div className="status-metric" key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </section>
  );
}

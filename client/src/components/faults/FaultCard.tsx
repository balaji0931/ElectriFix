import { ConfidenceBadge } from "./ConfidenceBadge";
import type { Fault } from "../../lib/types";

export function FaultCard({
  fault,
  selected,
  onSelect,
}: {
  readonly fault: Fault;
  readonly selected: boolean;
  readonly onSelect: () => void;
}) {
  const location =
    fault.topology_source === "FALLBACK"
      ? `DT ${fault.dt_id} area`
      : fault.span_pole_a && fault.span_pole_b
        ? `${fault.span_pole_a} to ${fault.span_pole_b}`
        : `DT ${fault.dt_id}`;
  return (
    <button className="fault-card" data-selected={selected} onClick={onSelect}>
      <span className="fault-card__topline">
        <span>{fault.fault_type.toUpperCase()} fault</span>
        <ConfidenceBadge level={fault.confidence_level} />
      </span>
      <strong>{location}</strong>
      <span>
        {fault.affected_pole_count} affected poles · PIN{" "}
        {fault.pincode ?? "unknown"}
      </span>
      <span className="topology-label" data-source={fault.topology_source}>
        {fault.topology_source.toLowerCase()} topology
      </span>
    </button>
  );
}

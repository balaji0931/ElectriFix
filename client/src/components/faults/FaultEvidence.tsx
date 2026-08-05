import { ConfidenceBadge } from "./ConfidenceBadge";
import type { Fault } from "../../lib/types";

export function FaultEvidence({ fault }: { readonly fault: Fault | null }) {
  if (!fault) {
    return (
      <section className="detail-empty">
        Select an active fault to inspect its evidence.
      </section>
    );
  }
  const evidence = fault.evidence;
  return (
    <section className="fault-evidence" aria-label="Fault evidence">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Localization evidence</p>
          <h2>
            {fault.topology_source === "FALLBACK"
              ? `DT ${fault.dt_id} area`
              : `${fault.fault_type} fault`}
          </h2>
        </div>
        <ConfidenceBadge level={fault.confidence_level} />
      </div>
      <dl className="evidence-grid">
        <div>
          <dt>Topology</dt>
          <dd>{fault.topology_source}</dd>
        </div>
        <div>
          <dt>Affected poles</dt>
          <dd>{fault.affected_pole_count}</dd>
        </div>
        <div>
          <dt>Last live</dt>
          <dd>{evidence.last_live_pole ?? "Unknown"}</dd>
        </div>
        <div>
          <dt>First dark</dt>
          <dd>{evidence.first_dark_pole ?? "Unknown"}</dd>
        </div>
        <div>
          <dt>PIN code</dt>
          <dd>{fault.pincode ?? "Unknown"}</dd>
        </div>
        <div>
          <dt>Suppressed sensors</dt>
          <dd>{evidence.suppressed_sensors.length || "None"}</dd>
        </div>
      </dl>
      <div className="confidence-reasons">
        <h3>Why this confidence</h3>
        {evidence.confidence_reasons.map((reason) => (
          <p
            key={`${reason.factor}-${reason.detail}`}
            data-positive={reason.positive}
          >
            <strong>{reason.factor}</strong> {reason.detail}
          </p>
        ))}
      </div>
      <div className="ai-summary">
        <h3>Operator summary</h3>
        <p>
          {fault.ai_summary ??
            "No generated summary is available. Use the structured evidence above."}
        </p>
      </div>
    </section>
  );
}

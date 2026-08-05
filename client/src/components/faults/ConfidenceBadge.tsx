import type { ConfidenceLevel } from "../../lib/types";

export function ConfidenceBadge({
  level,
}: {
  readonly level: ConfidenceLevel;
}) {
  return (
    <span className="confidence-badge" data-level={level}>
      {level}
    </span>
  );
}

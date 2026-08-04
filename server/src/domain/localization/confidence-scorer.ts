import type { ConfidenceLevel, ConfidenceReason } from "../contracts.js";
import type {
  ConfidenceInput,
  ConfidenceResult,
  LocalizationPolicies,
} from "./types.js";

export class ConfidenceScorer {
  constructor(
    private readonly policies: Pick<
      LocalizationPolicies,
      "sensorGapThreshold" | "staleHeartbeatMinutes"
    >,
  ) {}

  score(input: ConfidenceInput): ConfidenceResult {
    let level: ConfidenceLevel = "HIGH";
    const reasons: ConfidenceReason[] = [];
    const add = (factor: string, positive: boolean, detail: string) =>
      reasons.push(Object.freeze({ factor, positive, detail }));

    if (input.topologySource === "RECORDED") {
      add("Recorded topology", true, "Recorded wiring data is available");
    } else if (input.topologySource === "INFERRED") {
      level = "MEDIUM";
      add(
        "Topology quality",
        false,
        "Wiring order is estimated from pole coordinates",
      );
    } else {
      level = "LOW";
      add("Topology unknown", false, "Cannot determine a specific fault span");
    }

    if (input.unmonitoredPoleIds.length > 0 && level === "HIGH") {
      level = "MEDIUM";
      add(
        "Unmonitored boundary",
        false,
        "Unmonitored poles make the location approximate",
      );
    }

    const lastHeartbeatAt = input.lastLivePole?.lastHeartbeatAt;
    const heartbeatAgeMinutes = lastHeartbeatAt
      ? (input.evaluationTime.getTime() - lastHeartbeatAt.getTime()) / 60_000
      : Number.POSITIVE_INFINITY;
    if (
      input.lastLivePole &&
      heartbeatAgeMinutes > this.policies.staleHeartbeatMinutes
    ) {
      if (level === "HIGH") {
        level = "MEDIUM";
      }
      add(
        "Last live pole",
        false,
        "Last live pole heartbeat is stale or unavailable",
      );
    } else if (input.lastLivePole) {
      add("Last live pole", true, "Last live pole has a recent heartbeat");
    }

    if (input.downstreamDarkPoleIds.length === 1 && level === "HIGH") {
      level = "MEDIUM";
      add(
        "Downstream confirmation",
        false,
        "Only one downstream pole confirms dark",
      );
    } else if (input.downstreamDarkPoleIds.length >= 2) {
      add(
        "Downstream confirmations",
        true,
        `${input.downstreamDarkPoleIds.length} downstream poles confirm dark`,
      );
    }

    const allPresumedDark =
      input.downstreamDarkPoleIds.length > 0 &&
      input.downstreamDarkPoleIds.every(
        (poleId) => statesById(input, poleId)?.energized === "PRESUMED_DARK",
      );
    if (allPresumedDark) {
      level = "LOW";
      add(
        "Dark status",
        false,
        "Dark status is inferred from missed heartbeats",
      );
    }

    const sensorGapRatio =
      input.affectedPoleIds.length === 0
        ? 0
        : input.affectedPoleIds.filter(
            (poleId) => !statesById(input, poleId)?.hasDevice,
          ).length / input.affectedPoleIds.length;
    if (sensorGapRatio > this.policies.sensorGapThreshold) {
      level = "LOW";
      add(
        "Sensor coverage",
        false,
        "Insufficient sensor coverage to localize accurately",
      );
    }

    if (input.contradictory) {
      level = "LOW";
      add(
        "Contradictory data",
        false,
        "Live and dark topology observations conflict",
      );
    }

    return Object.freeze({ level, reasons: Object.freeze(reasons) });
  }
}

function statesById(input: ConfidenceInput, poleId: string) {
  return input.statesByPoleId.get(poleId);
}

import type { ProductPolicies } from "../../config/policies.js";
import {
  noiseFilterResult,
  type NoiseFilterResult,
  type ScheduledOutage,
} from "./types.js";

export interface ScheduledOutageFilterInput {
  readonly feederId: string;
  readonly distributionTransformerId: string;
  readonly outages: readonly ScheduledOutage[];
  readonly now: Date;
}

/** Suppresses affected assets only for documented outage windows and tolerance. */
export class ScheduledOutageFilter {
  constructor(
    private readonly policies: Pick<ProductPolicies, "outageToleranceMinutes">,
  ) {}

  evaluate(input: ScheduledOutageFilterInput): NoiseFilterResult {
    const toleranceMs = this.policies.outageToleranceMinutes * 60_000;
    const matchingOutages = input.outages.filter((outage) =>
      outageMatchesAsset(outage, input),
    );
    const activeOutages = matchingOutages.filter(
      (outage) =>
        input.now.getTime() >= outage.scheduledStart.getTime() - toleranceMs &&
        input.now.getTime() <= outage.scheduledEnd.getTime() + toleranceMs,
    );

    if (activeOutages.length === 0) {
      return noiseFilterResult("ALLOW", "NO_SUPPRESSION", {
        feeder_id: input.feederId,
        dt_id: input.distributionTransformerId,
      });
    }

    const withinScheduledWindow = activeOutages.some(
      (outage) =>
        input.now.getTime() >= outage.scheduledStart.getTime() &&
        input.now.getTime() <= outage.scheduledEnd.getTime(),
    );
    const selectedOutageIds = activeOutages.map((outage) => outage.outageId);

    return noiseFilterResult(
      "SUPPRESS",
      withinScheduledWindow ? "SCHEDULED_OUTAGE" : "OUTAGE_TOLERANCE",
      {
        feeder_id: input.feederId,
        dt_id: input.distributionTransformerId,
        outage_ids: selectedOutageIds,
      },
    );
  }
}

function outageMatchesAsset(
  outage: ScheduledOutage,
  input: ScheduledOutageFilterInput,
): boolean {
  return (
    (outage.scope === "feeder" && outage.targetId === input.feederId) ||
    (outage.scope === "dt" &&
      outage.targetId === input.distributionTransformerId)
  );
}

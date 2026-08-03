export const noiseFilterDecisions = [
  "ALLOW",
  "SUPPRESS",
  "DEFER",
  "MARK_PRESUMED_DARK",
] as const;
export type NoiseFilterDecision = (typeof noiseFilterDecisions)[number];

export const noiseFilterReasonCodes = [
  "NO_SUPPRESSION",
  "DEBOUNCE_ACTIVE",
  "PRESUMED_DARK",
  "DEAD_SENSOR",
  "SCHEDULED_OUTAGE",
  "OUTAGE_TOLERANCE",
] as const;
export type NoiseFilterReasonCode = (typeof noiseFilterReasonCodes)[number];

export type NoiseFilterContextValue =
  boolean | number | string | null | readonly string[];

export interface NoiseFilterResult {
  readonly decision: NoiseFilterDecision;
  readonly reasonCode: NoiseFilterReasonCode;
  readonly context: Readonly<Record<string, NoiseFilterContextValue>>;
}

export interface ScheduledOutage {
  readonly outageId: string;
  readonly scope: "feeder" | "dt";
  readonly targetId: string;
  readonly scheduledStart: Date;
  readonly scheduledEnd: Date;
  readonly reason: string | null;
}

export function noiseFilterResult(
  decision: NoiseFilterDecision,
  reasonCode: NoiseFilterReasonCode,
  context: Record<string, NoiseFilterContextValue> = {},
): NoiseFilterResult {
  return Object.freeze({
    decision,
    reasonCode,
    context: Object.freeze(
      Object.fromEntries(
        Object.entries(context).map(([key, value]) => [
          key,
          Array.isArray(value) ? Object.freeze([...value]) : value,
        ]),
      ),
    ),
  });
}

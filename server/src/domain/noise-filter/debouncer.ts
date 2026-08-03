import type { ProductPolicies } from "../../config/policies.js";
import type { PoleState } from "../pole-state/types.js";
import { noiseFilterResult, type NoiseFilterResult } from "./types.js";

export interface DebounceInput {
  readonly poleState: PoleState;
  readonly now: Date;
}

/** Determines whether sustained device silence warrants a presumed-dark update. */
export class Debouncer {
  constructor(
    private readonly policies: Pick<ProductPolicies, "debounceDurationMinutes">,
  ) {}

  evaluate(input: DebounceInput): NoiseFilterResult {
    const { poleState, now } = input;
    if (
      !poleState.hasDevice ||
      poleState.lastHeartbeatAt === null ||
      poleState.energized !== "LIVE"
    ) {
      return noiseFilterResult("ALLOW", "NO_SUPPRESSION", {
        pole_id: poleState.poleId,
      });
    }

    const silenceMinutes =
      (now.getTime() - poleState.lastHeartbeatAt.getTime()) / 60_000;
    const requiredSilenceMinutes = this.policies.debounceDurationMinutes;

    if (silenceMinutes <= requiredSilenceMinutes) {
      return noiseFilterResult("DEFER", "DEBOUNCE_ACTIVE", {
        pole_id: poleState.poleId,
        silence_minutes: silenceMinutes,
        required_silence_minutes: requiredSilenceMinutes,
      });
    }

    return noiseFilterResult("MARK_PRESUMED_DARK", "PRESUMED_DARK", {
      pole_id: poleState.poleId,
      silence_minutes: silenceMinutes,
      required_silence_minutes: requiredSilenceMinutes,
    });
  }
}

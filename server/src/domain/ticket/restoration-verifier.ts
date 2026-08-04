import type { ProductPolicies } from "../../config/policies.js";
import type {
  RestorationVerificationInput,
  RestorationVerificationResult,
} from "./types.js";

/** Evaluates telemetry-derived pole snapshots against the documented threshold. */
export class RestorationVerifier {
  constructor(
    private readonly policies: Pick<ProductPolicies, "verificationThreshold">,
  ) {}

  verify(input: RestorationVerificationInput): RestorationVerificationResult {
    const affectedPoleIds = new Set(input.affectedPoleIds);
    const affectedStates = input.poleStates.filter((state) =>
      affectedPoleIds.has(state.poleId),
    );
    const monitoredStates = affectedStates.filter((state) => state.hasDevice);
    const liveMonitoredPoleCount = monitoredStates.filter(
      (state) => state.energized === "LIVE",
    ).length;
    const monitoredPoleCount = monitoredStates.length;

    return Object.freeze({
      verified:
        monitoredPoleCount > 0 &&
        liveMonitoredPoleCount / monitoredPoleCount >=
          this.policies.verificationThreshold,
      liveMonitoredPoleCount,
      monitoredPoleCount,
    });
  }
}

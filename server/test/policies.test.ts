import { describe, expect, it } from "vitest";

import {
  defaultProductPolicies,
  loadProductPolicies,
} from "../src/config/policies.js";

describe("product policies", () => {
  it("uses the frozen defaults when no environment overrides are supplied", () => {
    expect(loadProductPolicies({})).toEqual(defaultProductPolicies);
  });

  it("maps each documented environment override to the canonical public policy name", () => {
    expect(
      loadProductPolicies({
        HEARTBEAT_INTERVAL_MINUTES: "10",
        HEARTBEAT_TIMEOUT_MULTIPLIER: "3",
        DEBOUNCE_DURATION_MINUTES: "25",
        OUTAGE_TOLERANCE_MINUTES: "35",
        VERIFICATION_THRESHOLD: "0.75",
        FEEDER_DARK_THRESHOLD: "0.85",
        STALE_HEARTBEAT_MINUTES: "18",
        SENSOR_GAP_THRESHOLD: "0.25",
      }),
    ).toEqual({
      heartbeatIntervalMinutes: 10,
      heartbeatTimeoutMultiplier: 3,
      debounceDurationMinutes: 25,
      outageToleranceMinutes: 35,
      verificationThreshold: 0.75,
      feederDarkThreshold: 0.85,
      staleHeartbeatMinutes: 18,
      sensorGapThreshold: 0.25,
    });
  });
});

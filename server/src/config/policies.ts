import { z } from "zod";

export interface ProductPolicies {
  heartbeatIntervalMinutes: number;
  heartbeatTimeoutMultiplier: number;
  debounceDurationMinutes: number;
  outageToleranceMinutes: number;
  verificationThreshold: number;
  feederDarkThreshold: number;
  staleHeartbeatMinutes: number;
  sensorGapThreshold: number;
}

export const defaultProductPolicies: ProductPolicies = {
  heartbeatIntervalMinutes: 15,
  heartbeatTimeoutMultiplier: 2,
  debounceDurationMinutes: 30,
  outageToleranceMinutes: 40,
  verificationThreshold: 0.8,
  feederDarkThreshold: 0.8,
  staleHeartbeatMinutes: 20,
  sensorGapThreshold: 0.3,
};

const policyEnvironmentSchema = z.object({
  HEARTBEAT_INTERVAL_MINUTES: z.coerce.number().optional(),
  HEARTBEAT_TIMEOUT_MULTIPLIER: z.coerce.number().optional(),
  DEBOUNCE_DURATION_MINUTES: z.coerce.number().optional(),
  OUTAGE_TOLERANCE_MINUTES: z.coerce.number().optional(),
  VERIFICATION_THRESHOLD: z.coerce.number().optional(),
  FEEDER_DARK_THRESHOLD: z.coerce.number().optional(),
  STALE_HEARTBEAT_MINUTES: z.coerce.number().optional(),
  SENSOR_GAP_THRESHOLD: z.coerce.number().optional(),
});

/**
 * Converts documented environment overrides into the public product-policy
 * contract. This is the sole module that reads policy environment variables.
 */
export function loadProductPolicies(
  environment: NodeJS.ProcessEnv = process.env,
): ProductPolicies {
  const overrides = policyEnvironmentSchema.parse(environment);

  return {
    heartbeatIntervalMinutes:
      overrides.HEARTBEAT_INTERVAL_MINUTES ??
      defaultProductPolicies.heartbeatIntervalMinutes,
    heartbeatTimeoutMultiplier:
      overrides.HEARTBEAT_TIMEOUT_MULTIPLIER ??
      defaultProductPolicies.heartbeatTimeoutMultiplier,
    debounceDurationMinutes:
      overrides.DEBOUNCE_DURATION_MINUTES ??
      defaultProductPolicies.debounceDurationMinutes,
    outageToleranceMinutes:
      overrides.OUTAGE_TOLERANCE_MINUTES ??
      defaultProductPolicies.outageToleranceMinutes,
    verificationThreshold:
      overrides.VERIFICATION_THRESHOLD ??
      defaultProductPolicies.verificationThreshold,
    feederDarkThreshold:
      overrides.FEEDER_DARK_THRESHOLD ??
      defaultProductPolicies.feederDarkThreshold,
    staleHeartbeatMinutes:
      overrides.STALE_HEARTBEAT_MINUTES ??
      defaultProductPolicies.staleHeartbeatMinutes,
    sensorGapThreshold:
      overrides.SENSOR_GAP_THRESHOLD ??
      defaultProductPolicies.sensorGapThreshold,
  };
}

export const policies = loadProductPolicies();

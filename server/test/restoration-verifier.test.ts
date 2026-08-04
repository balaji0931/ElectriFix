import { describe, expect, it } from "vitest";

import { RestorationVerifier } from "../src/domain/ticket/restoration-verifier.js";
import type { PoleState } from "../src/domain/pole-state/types.js";

const verifier = new RestorationVerifier({ verificationThreshold: 0.8 });

describe("RestorationVerifier", () => {
  it("verifies at the threshold boundary", () => {
    const result = verifier.verify({
      affectedPoleIds: ["P-1", "P-2", "P-3", "P-4", "P-5"],
      poleStates: [
        state("P-1", "LIVE"),
        state("P-2", "LIVE"),
        state("P-3", "LIVE"),
        state("P-4", "LIVE"),
        state("P-5", "DARK"),
      ],
    });

    expect(result).toEqual({
      verified: true,
      liveMonitoredPoleCount: 4,
      monitoredPoleCount: 5,
    });
  });

  it("rejects below threshold and excludes unmonitored poles", () => {
    const below = verifier.verify({
      affectedPoleIds: ["P-1", "P-2", "P-3", "P-4"],
      poleStates: [
        state("P-1", "LIVE"),
        state("P-2", "LIVE"),
        state("P-3", "LIVE"),
        state("P-4", "DARK"),
      ],
    });
    const excludingUnmonitored = verifier.verify({
      affectedPoleIds: ["P-1", "P-2", "P-3", "P-4", "P-5"],
      poleStates: [
        state("P-1", "LIVE"),
        state("P-2", "LIVE"),
        state("P-3", "LIVE"),
        state("P-4", "LIVE"),
        state("P-5", "UNKNOWN", false),
      ],
    });

    expect(below.verified).toBe(false);
    expect(excludingUnmonitored).toEqual({
      verified: true,
      liveMonitoredPoleCount: 4,
      monitoredPoleCount: 4,
    });
  });
});

function state(
  poleId: string,
  energized: PoleState["energized"],
  hasDevice = true,
): PoleState {
  return {
    poleId,
    energized,
    lastHeartbeatAt: null,
    lastEventAt: null,
    lastBootCounter: null,
    lastSeq: null,
    firmwareVersion: null,
    deviceHealth: hasDevice ? "HEALTHY" : "NO_DEVICE",
    hasDevice,
    batteryMv: null,
    rssi: null,
    updatedAt: new Date("2026-08-05T12:00:00.000Z"),
  };
}

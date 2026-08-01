import { describe, expect, it } from "vitest";

import {
  generateSeedData,
  loadOutageTemplates,
} from "../src/infrastructure/db/seed.js";

describe("Phase 1 seed data", () => {
  const seedTime = new Date("2026-08-05T10:00:00.000Z");
  const seedData = generateSeedData(seedTime);

  it("creates the documented registry scale and topology split", () => {
    expect(seedData.feeders).toHaveLength(5);
    expect(seedData.distributionTransformers).toHaveLength(60);
    expect(seedData.poles).toHaveLength(4_000);

    expect(
      seedData.distributionTransformers.filter((dt) => dt.hasRecordedTopology),
    ).toHaveLength(24);
    expect(
      seedData.distributionTransformers.filter((dt) => !dt.hasRecordedTopology),
    ).toHaveLength(36);
  });

  it("keeps recorded and missing topology internally consistent", () => {
    const transformersById = new Map(
      seedData.distributionTransformers.map((dt) => [dt.dtId, dt]),
    );

    for (const pole of seedData.poles) {
      const transformer = transformersById.get(pole.dtId);

      expect(transformer).toBeDefined();

      if (transformer?.hasRecordedTopology) {
        expect(pole.seqOnLine).not.toBeNull();
      } else {
        expect(pole.seqOnLine).toBeNull();
        expect(pole.parentPoleId).toBeNull();
      }
    }
  });

  it("creates one initialized pole state per pole with the correct device distinction", () => {
    expect(seedData.poleStates).toHaveLength(seedData.poles.length);

    const deviceLessPoles = seedData.poles.filter(
      (pole) => pole.deviceId === null,
    );
    const noDeviceStates = seedData.poleStates.filter(
      (state) => state.deviceHealth === "NO_DEVICE",
    );

    expect(deviceLessPoles).toHaveLength(360);
    expect(noDeviceStates).toHaveLength(deviceLessPoles.length);
    expect(
      seedData.poleStates.every((state) => state.energized === "UNKNOWN"),
    ).toBe(true);
    expect(
      seedData.poleStates.every((state) => state.lastHeartbeatAt === null),
    ).toBe(true);
    expect(
      seedData.poleStates.every((state) => state.lastEventAt === null),
    ).toBe(true);
  });

  it("includes the documented pincode gap", () => {
    expect(seedData.poles.filter((pole) => pole.pincode === null)).toHaveLength(
      120,
    );
  });

  it("loads a balanced relative-time outage template set", async () => {
    const outages = await loadOutageTemplates();

    expect(outages).toHaveLength(15);
    expect(
      outages.some(
        (outage) =>
          outage.start_offset_minutes < 0 && outage.end_offset_minutes < 0,
      ),
    ).toBe(true);
    expect(
      outages.some(
        (outage) =>
          outage.start_offset_minutes < 0 && outage.end_offset_minutes > 0,
      ),
    ).toBe(true);
    expect(outages.some((outage) => outage.start_offset_minutes > 0)).toBe(
      true,
    );
  });
});

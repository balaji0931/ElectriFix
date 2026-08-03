import { describe, expect, it } from "vitest";

import { ScheduledOutageClient } from "../src/infrastructure/scheduled-outage-client.js";

describe("ScheduledOutageClient", () => {
  it("returns immutable outage records from the read-only outage feed", async () => {
    const client = new ScheduledOutageClient({
      async listScheduledOutages() {
        return [
          {
            outageId: "SO-001",
            scope: "dt" as const,
            targetId: "D-01",
            scheduledStart: new Date("2026-08-05T10:00:00.000Z"),
            scheduledEnd: new Date("2026-08-05T11:00:00.000Z"),
            reason: "Maintenance",
            createdAt: new Date("2026-08-05T09:00:00.000Z"),
          },
        ];
      },
    });

    const outages = await client.listScheduledOutages();

    expect(outages).toHaveLength(1);
    expect(outages[0]).toMatchObject({ outageId: "SO-001", scope: "dt" });
    expect(Object.isFrozen(outages)).toBe(true);
    expect(Object.isFrozen(outages[0])).toBe(true);
  });
});

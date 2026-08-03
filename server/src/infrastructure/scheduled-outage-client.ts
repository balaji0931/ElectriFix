import type { ScheduledOutage } from "../domain/noise-filter/types.js";

export interface ScheduledOutageFeedRecord {
  readonly outageId: string;
  readonly scope: string;
  readonly targetId: string;
  readonly scheduledStart: Date;
  readonly scheduledEnd: Date;
  readonly reason: string | null;
}

export interface ScheduledOutageFeed {
  listScheduledOutages(): PromiseLike<ReadonlyArray<ScheduledOutageFeedRecord>>;
}

/** Read-only adapter for the assignment's seeded scheduled-outage feed. */
export class ScheduledOutageClient {
  constructor(private readonly outageFeed: ScheduledOutageFeed) {}

  async listScheduledOutages(): Promise<ReadonlyArray<ScheduledOutage>> {
    const outages = await this.outageFeed.listScheduledOutages();

    return Object.freeze(
      outages.map((outage) => {
        if (outage.scope !== "dt" && outage.scope !== "feeder") {
          throw new Error(
            `Unsupported scheduled outage scope: ${outage.scope}`,
          );
        }

        return Object.freeze({
          outageId: outage.outageId,
          scope: outage.scope,
          targetId: outage.targetId,
          scheduledStart: new Date(outage.scheduledStart),
          scheduledEnd: new Date(outage.scheduledEnd),
          reason: outage.reason,
        });
      }),
    );
  }
}

import type {
  EventPipeline,
  TelemetryAdmission,
} from "../infrastructure/event-pipeline.js";
import type { TelemetryEventRequest } from "../presentation/contracts/api.schemas.js";

/** Thin application use case that exposes EventPipeline admission to transport. */
export class IngestTelemetry {
  constructor(private readonly pipeline: EventPipeline) {}

  ingest(event: TelemetryEventRequest): Promise<TelemetryAdmission> {
    return this.pipeline.admit(event);
  }

  async ingestBatch(
    events: ReadonlyArray<TelemetryEventRequest>,
  ): Promise<ReadonlyArray<TelemetryAdmission>> {
    const admissions: TelemetryAdmission[] = [];
    for (const event of events) {
      admissions.push(await this.pipeline.admit(event));
    }
    return admissions;
  }
}

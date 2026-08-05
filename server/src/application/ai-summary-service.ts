import type {
  ConfidenceLevel,
  FaultEvidence,
  FaultType,
  TopologySource,
} from "../domain/contracts.js";

export interface AiSummaryInput {
  readonly faultType: FaultType;
  readonly topologySource: TopologySource;
  readonly confidenceLevel: ConfidenceLevel;
  readonly affectedPoleCount: number;
  readonly pincode: string | null;
  readonly evidence: FaultEvidence;
}

export interface AiSummaryProvider {
  generate(prompt: string): Promise<string | null>;
}

/** Optional enrichment only; failures intentionally leave the summary null. */
export class AiSummaryService {
  constructor(
    private readonly enabled: boolean,
    private readonly provider: AiSummaryProvider,
  ) {}

  async generate(input: AiSummaryInput): Promise<string | null> {
    if (!this.enabled) {
      return null;
    }

    try {
      return await this.provider.generate(buildIncidentSummaryPrompt(input));
    } catch {
      return null;
    }
  }
}

export function buildIncidentSummaryPrompt(input: AiSummaryInput): string {
  return [
    "Write a concise operator incident summary using only the supplied evidence.",
    "Do not infer facts, recommend actions, change confidence, or claim precision absent from the evidence.",
    "If a value is null or unknown, state that uncertainty plainly.",
    JSON.stringify({
      fault_type: input.faultType,
      topology_source: input.topologySource,
      confidence_level: input.confidenceLevel,
      affected_pole_count: input.affectedPoleCount,
      pincode: input.pincode,
      evidence: input.evidence,
    }),
  ].join("\n\n");
}

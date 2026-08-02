import type { StartupSnapshot } from "../../infrastructure/db/bootstrap.js";
import { FallbackTopologyResolver } from "./fallback-topology-resolver.js";
import { NetworkGraph } from "./network-graph.js";
import { RecordedTopologyResolver } from "./recorded-topology-resolver.js";
import { TopologyValidationError } from "./types.js";

export interface TopologyResolver {
  resolve(dtId: string): NetworkGraph;
}

/** Caches immutable, registry-derived graphs for the lifetime of a startup snapshot. */
export class CachedTopologyResolver implements TopologyResolver {
  private readonly recordedResolver: RecordedTopologyResolver;
  private readonly fallbackResolver: FallbackTopologyResolver;
  private readonly graphCache = new Map<string, NetworkGraph>();

  constructor(private readonly startupSnapshot: StartupSnapshot) {
    this.recordedResolver = new RecordedTopologyResolver(startupSnapshot);
    this.fallbackResolver = new FallbackTopologyResolver(startupSnapshot);
  }

  resolve(dtId: string): NetworkGraph {
    const cached = this.graphCache.get(dtId);
    if (cached) {
      return cached;
    }

    const transformer = this.startupSnapshot.distributionTransformers.find(
      (candidate) => candidate.dtId === dtId,
    );
    if (!transformer) {
      throw new TopologyValidationError(
        `Unknown distribution transformer: ${dtId}`,
      );
    }

    const graph = transformer.hasRecordedTopology
      ? this.recordedResolver.resolve(dtId)
      : this.fallbackResolver.resolve(dtId);

    this.graphCache.set(dtId, graph);
    return graph;
  }
}

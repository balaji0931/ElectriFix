import type { PoleState } from "../domain/pole-state/types.js";
import type { StartupSnapshot } from "../infrastructure/db/bootstrap.js";
import type { TopologyResolver } from "../domain/topology/topology-resolver.js";

export class GetNetworkData {
  constructor(
    private readonly snapshot: StartupSnapshot,
    private readonly poleStateReader: {
      getPoleStates(): ReadonlyArray<PoleState>;
      getPoleState(poleId: string): PoleState | undefined;
    },
    private readonly topologyResolver: TopologyResolver,
  ) {}

  poles() {
    return this.snapshot.poles;
  }
  distributionTransformers() {
    return this.snapshot.distributionTransformers;
  }
  feeders() {
    return this.snapshot.feeders;
  }
  poleStates() {
    return this.poleStateReader.getPoleStates();
  }
  poleState(poleId: string) {
    return this.poleStateReader.getPoleState(poleId);
  }
  topology(dtId: string) {
    return this.topologyResolver.resolve(dtId);
  }
}

import type { PoleStatePersistenceModel } from "../repositories/pole-repository.js";
import { NetworkRepository } from "../repositories/network-repository.js";
import { PoleRepository } from "../repositories/pole-repository.js";

export interface StartupSnapshot {
  readonly feeders: ReadonlyArray<
    Awaited<ReturnType<NetworkRepository["listFeeders"]>>[number]
  >;
  readonly distributionTransformers: ReadonlyArray<
    Awaited<
      ReturnType<NetworkRepository["listDistributionTransformers"]>
    >[number]
  >;
  readonly poles: ReadonlyArray<
    Awaited<ReturnType<NetworkRepository["listPoles"]>>[number]
  >;
  readonly poleStates: ReadonlyArray<PoleStatePersistenceModel>;
}

export async function bootstrapStartupState(
  networkRepository: NetworkRepository,
  poleRepository: PoleRepository,
): Promise<StartupSnapshot> {
  const [feeders, distributionTransformers, poles, poleStates] =
    await Promise.all([
      networkRepository.listFeeders(),
      networkRepository.listDistributionTransformers(),
      networkRepository.listPoles(),
      poleRepository.listPoleStates(),
    ]);

  validateStartupData(feeders, distributionTransformers, poles, poleStates);

  return Object.freeze({
    feeders: Object.freeze([...feeders]),
    distributionTransformers: Object.freeze([...distributionTransformers]),
    poles: Object.freeze([...poles]),
    poleStates: Object.freeze([...poleStates]),
  });
}

function validateStartupData(
  feeders: Awaited<ReturnType<NetworkRepository["listFeeders"]>>,
  distributionTransformers: Awaited<
    ReturnType<NetworkRepository["listDistributionTransformers"]>
  >,
  poles: Awaited<ReturnType<NetworkRepository["listPoles"]>>,
  poleStates: PoleStatePersistenceModel[],
): void {
  if (feeders.length === 0) {
    throw new Error("Startup requires at least one feeder");
  }
  if (distributionTransformers.length === 0) {
    throw new Error("Startup requires at least one distribution transformer");
  }
  if (poles.length === 0) {
    throw new Error("Startup requires at least one pole");
  }

  const feederIds = new Set(feeders.map((feeder) => feeder.feederId));
  const transformersById = new Map(
    distributionTransformers.map((transformer) => [
      transformer.dtId,
      transformer,
    ]),
  );
  const statesByPoleId = new Map<string, number>();

  for (const transformer of distributionTransformers) {
    if (!feederIds.has(transformer.feederId)) {
      throw new Error(
        `Distribution transformer ${transformer.dtId} references an unknown feeder`,
      );
    }
  }

  for (const state of poleStates) {
    statesByPoleId.set(
      state.poleId,
      (statesByPoleId.get(state.poleId) ?? 0) + 1,
    );
  }

  for (const pole of poles) {
    const transformer = transformersById.get(pole.dtId);

    if (!transformer) {
      throw new Error(
        `Pole ${pole.poleId} references an unknown distribution transformer`,
      );
    }
    if (
      !feederIds.has(pole.feederId) ||
      transformer.feederId !== pole.feederId
    ) {
      throw new Error(
        `Pole ${pole.poleId} has an inconsistent feeder relationship`,
      );
    }
    if (statesByPoleId.get(pole.poleId) !== 1) {
      throw new Error(`Pole ${pole.poleId} must have exactly one pole state`);
    }
  }

  if (poleStates.length !== poles.length) {
    throw new Error("Pole state records must correspond one-to-one with poles");
  }
}

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import {
  distributionTransformers,
  feeders,
  poles,
  poleStates,
  scheduledOutages,
} from "./schema.js";

const FEEDER_COUNT = 5;
const DTS_PER_FEEDER = 12;
const TOTAL_DTS = FEEDER_COUNT * DTS_PER_FEEDER;
const TOTAL_POLES = 4_000;
const RECORDED_TOPOLOGY_DTS = 24;
const DEVICELESS_POLES = 360;
const PINCODELESS_POLES = 120;
const INSERT_BATCH_SIZE = 250;

type OutageTemplate = {
  outage_id: string;
  scope: "dt" | "feeder";
  target_id: string;
  start_offset_minutes: number;
  end_offset_minutes: number;
  reason: string;
};

type SeedData = {
  feeders: (typeof feeders.$inferInsert)[];
  distributionTransformers: (typeof distributionTransformers.$inferInsert)[];
  poles: (typeof poles.$inferInsert)[];
  poleStates: (typeof poleStates.$inferInsert)[];
};

function pad(value: number, width: number): string {
  return value.toString().padStart(width, "0");
}

function dateWithOffset(seedTime: Date, minutes: number): Date {
  return new Date(seedTime.getTime() + minutes * 60_000);
}

function isSelected(
  index: number,
  selectedCount: number,
  totalCount: number,
): boolean {
  return (index * 37) % totalCount < selectedCount;
}

function depthForPole(index: number): number {
  return Math.floor(Math.log2(index + 1)) + 1;
}

export function generateSeedData(seedTime: Date): SeedData {
  const feederRows: SeedData["feeders"] = [];
  const transformerRows: SeedData["distributionTransformers"] = [];
  const poleRows: SeedData["poles"] = [];
  const stateRows: SeedData["poleStates"] = [];

  for (let feederIndex = 0; feederIndex < FEEDER_COUNT; feederIndex += 1) {
    const feederId = `F-07-${pad(feederIndex + 1, 2)}`;

    feederRows.push({
      feederId,
      substationId: "SS-07",
      name: `South Division Feeder ${feederIndex + 1}`,
      createdAt: seedTime,
    });
  }

  let globalPoleIndex = 0;

  for (
    let transformerIndex = 0;
    transformerIndex < TOTAL_DTS;
    transformerIndex += 1
  ) {
    const feederIndex = Math.floor(transformerIndex / DTS_PER_FEEDER);
    const feederId = `F-07-${pad(feederIndex + 1, 2)}`;
    const dtId = `D-${pad(transformerIndex + 1, 4)}`;
    const hasRecordedTopology = transformerIndex < RECORDED_TOPOLOGY_DTS;
    const poleCount = 66 + (transformerIndex < 40 ? 1 : 0);
    const dtLat =
      12.9005 +
      feederIndex * 0.028 +
      (transformerIndex % DTS_PER_FEEDER) * 0.0017;
    const dtLon =
      77.5205 +
      feederIndex * 0.018 +
      (transformerIndex % DTS_PER_FEEDER) * 0.0013;

    transformerRows.push({
      dtId,
      feederId,
      lat: dtLat,
      lon: dtLon,
      capacityKva: 100 + (transformerIndex % 4) * 50,
      householdsServed: 75 + (transformerIndex % 5) * 25,
      hasRecordedTopology,
      createdAt: seedTime,
    });

    for (let poleIndex = 0; poleIndex < poleCount; poleIndex += 1) {
      const poleId = `P-${pad(globalPoleIndex + 1, 6)}`;
      const parentIndex =
        poleIndex === 0 ? null : Math.floor((poleIndex - 1) / 2);
      const parentPoleId =
        parentIndex === null
          ? null
          : `P-${pad(globalPoleIndex - poleIndex + parentIndex + 1, 6)}`;
      const hasDevice = !isSelected(
        globalPoleIndex,
        DEVICELESS_POLES,
        TOTAL_POLES,
      );

      poleRows.push({
        poleId,
        lat:
          dtLat +
          (poleIndex % 11) * 0.00014 +
          Math.floor(poleIndex / 11) * 0.00003,
        lon:
          dtLon +
          Math.floor(poleIndex / 11) * 0.00016 +
          (poleIndex % 11) * 0.00002,
        feederId,
        dtId,
        seqOnLine: hasRecordedTopology ? depthForPole(poleIndex) : null,
        parentPoleId: hasRecordedTopology ? parentPoleId : null,
        poleType: poleIndex % 3 === 0 ? "LT-9m-PCC" : "LT-8m-RCC",
        ward: `Ward-${pad((transformerIndex % 10) + 1, 2)}`,
        pincode: isSelected(globalPoleIndex, PINCODELESS_POLES, TOTAL_POLES)
          ? null
          : `560${pad(70 + (transformerIndex % 10), 3)}`,
        deviceId: hasDevice ? `DEV-${pad(globalPoleIndex + 1, 6)}` : null,
        createdAt: seedTime,
      });

      stateRows.push({
        poleId,
        energized: "UNKNOWN",
        lastHeartbeatAt: null,
        lastEventAt: null,
        lastBootCounter: null,
        lastSeq: null,
        firmwareVersion: null,
        deviceHealth: hasDevice ? "HEALTHY" : "NO_DEVICE",
        hasDevice,
        batteryMv: null,
        rssi: null,
        updatedAt: seedTime,
      });

      globalPoleIndex += 1;
    }
  }

  return {
    feeders: feederRows,
    distributionTransformers: transformerRows,
    poles: poleRows,
    poleStates: stateRows,
  };
}

export async function loadOutageTemplates(): Promise<OutageTemplate[]> {
  const templatePath = fileURLToPath(
    new URL("../../../../data/seed/scheduled-outages.json", import.meta.url),
  );
  const file = await readFile(templatePath, "utf8");

  return JSON.parse(file) as OutageTemplate[];
}

export async function seedDatabase(
  pool: Pool,
  seedTime = new Date(),
): Promise<void> {
  const db = drizzle(pool);
  const seedData = generateSeedData(seedTime);
  const outageTemplates = await loadOutageTemplates();

  await db.insert(feeders).values(seedData.feeders).onConflictDoNothing();
  await db
    .insert(distributionTransformers)
    .values(seedData.distributionTransformers)
    .onConflictDoNothing();

  for (
    let offset = 0;
    offset < seedData.poles.length;
    offset += INSERT_BATCH_SIZE
  ) {
    await db
      .insert(poles)
      .values(seedData.poles.slice(offset, offset + INSERT_BATCH_SIZE))
      .onConflictDoNothing();
  }

  for (
    let offset = 0;
    offset < seedData.poleStates.length;
    offset += INSERT_BATCH_SIZE
  ) {
    await db
      .insert(poleStates)
      .values(seedData.poleStates.slice(offset, offset + INSERT_BATCH_SIZE))
      .onConflictDoNothing();
  }

  await db
    .insert(scheduledOutages)
    .values(
      outageTemplates.map((template) => ({
        outageId: template.outage_id,
        scope: template.scope,
        targetId: template.target_id,
        scheduledStart: dateWithOffset(seedTime, template.start_offset_minutes),
        scheduledEnd: dateWithOffset(seedTime, template.end_offset_minutes),
        reason: template.reason,
        createdAt: seedTime,
      })),
    )
    .onConflictDoUpdate({
      target: scheduledOutages.outageId,
      set: {
        scheduledStart: sql`excluded.scheduled_start`,
        scheduledEnd: sql`excluded.scheduled_end`,
        reason: sql`excluded.reason`,
      },
    });
}

async function main() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is required to seed the database");
  }

  const pool = new Pool({ connectionString });

  try {
    await seedDatabase(pool);
  } finally {
    await pool.end();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main();
}

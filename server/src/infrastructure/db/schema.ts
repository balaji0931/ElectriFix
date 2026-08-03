import { sql } from "drizzle-orm";
import {
  AnyPgColumn,
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const feeders = pgTable("feeders", {
  feederId: text("feeder_id").primaryKey(),
  substationId: text("substation_id").notNull(),
  name: text("name"),
  createdAt: timestamp("created_at").notNull(),
});

export const distributionTransformers = pgTable("distribution_transformers", {
  dtId: text("dt_id").primaryKey(),
  feederId: text("feeder_id")
    .notNull()
    .references(() => feeders.feederId, { onDelete: "restrict" }),
  lat: doublePrecision("lat").notNull(),
  lon: doublePrecision("lon").notNull(),
  capacityKva: integer("capacity_kva"),
  householdsServed: integer("households_served"),
  hasRecordedTopology: boolean("has_recorded_topology").notNull(),
  createdAt: timestamp("created_at").notNull(),
});

export const poles = pgTable(
  "poles",
  {
    poleId: text("pole_id").primaryKey(),
    lat: doublePrecision("lat").notNull(),
    lon: doublePrecision("lon").notNull(),
    feederId: text("feeder_id")
      .notNull()
      .references(() => feeders.feederId, { onDelete: "restrict" }),
    dtId: text("dt_id")
      .notNull()
      .references(() => distributionTransformers.dtId, {
        onDelete: "restrict",
      }),
    seqOnLine: integer("seq_on_line"),
    parentPoleId: text("parent_pole_id").references(
      (): AnyPgColumn => poles.poleId,
      {
        onDelete: "set null",
      },
    ),
    poleType: text("pole_type"),
    ward: text("ward"),
    pincode: text("pincode"),
    deviceId: text("device_id"),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [
    index("idx_poles_dt").on(table.dtId),
    index("idx_poles_feeder").on(table.feederId),
    index("idx_poles_parent").on(table.parentPoleId),
    index("idx_poles_device").on(table.deviceId),
  ],
);

export const telemetryEvents = pgTable(
  "telemetry_events",
  {
    id: uuid("id").primaryKey(),
    deviceId: text("device_id").notNull(),
    poleId: text("pole_id")
      .notNull()
      .references(() => poles.poleId, { onDelete: "restrict" }),
    event: text("event").notNull(),
    energized: boolean("energized").notNull(),
    deviceTs: timestamp("device_ts").notNull(),
    bootCounter: integer("boot_counter").notNull(),
    seq: integer("seq").notNull(),
    batteryMv: integer("battery_mv"),
    rssi: integer("rssi"),
    firmware: text("firmware"),
    receivedAt: timestamp("received_at").notNull(),
  },
  (table) => [
    uniqueIndex("uq_device_boot_counter_seq").on(
      table.deviceId,
      table.bootCounter,
      table.seq,
    ),
    index("idx_telem_pole_received").on(
      table.poleId,
      sql`${table.receivedAt} DESC`,
    ),
    index("idx_telem_received").on(sql`${table.receivedAt} DESC`),
    check(
      "ck_event_type",
      sql`${table.event} IN ('heartbeat', 'power_lost', 'power_restored', 'boot')`,
    ),
  ],
);

export const poleStates = pgTable(
  "pole_states",
  {
    poleId: text("pole_id")
      .primaryKey()
      .references(() => poles.poleId, { onDelete: "cascade" }),
    energized: text("energized").notNull(),
    lastHeartbeatAt: timestamp("last_heartbeat_at"),
    lastEventAt: timestamp("last_event_at"),
    lastBootCounter: integer("last_boot_counter"),
    lastSeq: integer("last_seq"),
    firmwareVersion: text("firmware_version"),
    deviceHealth: text("device_health").notNull(),
    hasDevice: boolean("has_device").notNull(),
    batteryMv: integer("battery_mv"),
    rssi: integer("rssi"),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [
    check(
      "ck_energized_status",
      sql`${table.energized} IN ('LIVE', 'DARK', 'PRESUMED_DARK', 'UNKNOWN')`,
    ),
    check(
      "ck_device_health",
      sql`${table.deviceHealth} IN ('NO_DEVICE', 'HEALTHY', 'OFFLINE', 'DEGRADED')`,
    ),
  ],
);

export const faults = pgTable(
  "faults",
  {
    faultId: uuid("fault_id").primaryKey(),
    dtId: text("dt_id")
      .notNull()
      .references(() => distributionTransformers.dtId, {
        onDelete: "restrict",
      }),
    feederId: text("feeder_id")
      .notNull()
      .references(() => feeders.feederId, { onDelete: "restrict" }),
    faultType: text("fault_type").notNull(),
    status: text("status").notNull().default("active"),
    spanPoleA: text("span_pole_a").references(() => poles.poleId, {
      onDelete: "restrict",
    }),
    spanPoleB: text("span_pole_b").references(() => poles.poleId, {
      onDelete: "restrict",
    }),
    lat: doublePrecision("lat").notNull(),
    lon: doublePrecision("lon").notNull(),
    pincode: text("pincode"),
    affectedPoleCount: integer("affected_pole_count").notNull(),
    confidenceLevel: text("confidence_level").notNull(),
    topologySource: text("topology_source").notNull(),
    evidence: jsonb("evidence").$type<Record<string, unknown>>().notNull(),
    aiSummary: text("ai_summary"),
    mergedIntoFaultId: uuid("merged_into_fault_id").references(
      (): AnyPgColumn => faults.faultId,
      {
        onDelete: "set null",
      },
    ),
    detectedAt: timestamp("detected_at").notNull(),
    resolvedAt: timestamp("resolved_at"),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [
    index("idx_faults_status")
      .on(table.status)
      .where(sql`${table.status} = 'active'`),
    index("idx_faults_dt").on(table.dtId),
    index("idx_faults_detected").on(sql`${table.detectedAt} DESC`),
    check("ck_fault_type", sql`${table.faultType} IN ('span', 'dt', 'feeder')`),
    check(
      "ck_fault_status",
      sql`${table.status} IN ('active', 'resolved', 'merged')`,
    ),
    check(
      "ck_confidence",
      sql`${table.confidenceLevel} IN ('HIGH', 'MEDIUM', 'LOW')`,
    ),
    check(
      "ck_topology_source",
      sql`${table.topologySource} IN ('RECORDED', 'INFERRED', 'FALLBACK')`,
    ),
  ],
);

export const tickets = pgTable(
  "tickets",
  {
    ticketId: uuid("ticket_id").primaryKey(),
    faultId: uuid("fault_id")
      .notNull()
      .references(() => faults.faultId, { onDelete: "restrict" }),
    status: text("status").notNull(),
    assignedCrew: text("assigned_crew"),
    operatorNotes: text("operator_notes"),
    rejectionCount: integer("rejection_count").notNull().default(0),
    rejectionReason: text("rejection_reason"),
    detectedAt: timestamp("detected_at").notNull(),
    acknowledgedAt: timestamp("acknowledged_at"),
    crewAssignedAt: timestamp("crew_assigned_at"),
    resolvedAt: timestamp("resolved_at"),
    verifiedAt: timestamp("verified_at"),
    closedAt: timestamp("closed_at"),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("uq_ticket_fault").on(table.faultId),
    index("idx_tickets_status")
      .on(table.status)
      .where(sql`${table.status} NOT IN ('verified', 'closed')`),
    index("idx_tickets_fault").on(table.faultId),
    check(
      "ck_ticket_status",
      sql`${table.status} IN ('detected', 'acknowledged', 'crew_assigned', 'resolved', 'verified', 'closed')`,
    ),
  ],
);

export const scheduledOutages = pgTable(
  "scheduled_outages",
  {
    outageId: text("outage_id").primaryKey(),
    scope: text("scope").notNull(),
    targetId: text("target_id").notNull(),
    scheduledStart: timestamp("scheduled_start").notNull(),
    scheduledEnd: timestamp("scheduled_end").notNull(),
    reason: text("reason"),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [
    index("idx_outages_time").on(table.scheduledStart, table.scheduledEnd),
    index("idx_outages_target").on(table.scope, table.targetId),
    check("ck_outage_scope", sql`${table.scope} IN ('feeder', 'dt')`),
  ],
);

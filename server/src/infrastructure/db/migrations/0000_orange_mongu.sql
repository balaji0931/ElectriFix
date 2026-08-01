CREATE TABLE "distribution_transformers" (
	"dt_id" text PRIMARY KEY NOT NULL,
	"feeder_id" text NOT NULL,
	"lat" double precision NOT NULL,
	"lon" double precision NOT NULL,
	"capacity_kva" integer,
	"households_served" integer,
	"has_recorded_topology" boolean NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "faults" (
	"fault_id" uuid PRIMARY KEY NOT NULL,
	"dt_id" text NOT NULL,
	"feeder_id" text NOT NULL,
	"fault_type" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"span_pole_a" text,
	"span_pole_b" text,
	"lat" double precision NOT NULL,
	"lon" double precision NOT NULL,
	"pincode" text,
	"affected_pole_count" integer NOT NULL,
	"confidence_level" text NOT NULL,
	"topology_source" text NOT NULL,
	"evidence" jsonb NOT NULL,
	"ai_summary" text,
	"merged_into_fault_id" uuid,
	"detected_at" timestamp NOT NULL,
	"resolved_at" timestamp,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "ck_fault_type" CHECK ("faults"."fault_type" IN ('span', 'dt', 'feeder')),
	CONSTRAINT "ck_fault_status" CHECK ("faults"."status" IN ('active', 'resolved', 'merged')),
	CONSTRAINT "ck_confidence" CHECK ("faults"."confidence_level" IN ('HIGH', 'MEDIUM', 'LOW')),
	CONSTRAINT "ck_topology_source" CHECK ("faults"."topology_source" IN ('RECORDED', 'INFERRED', 'FALLBACK'))
);
--> statement-breakpoint
CREATE TABLE "feeders" (
	"feeder_id" text PRIMARY KEY NOT NULL,
	"substation_id" text NOT NULL,
	"name" text,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pole_states" (
	"pole_id" text PRIMARY KEY NOT NULL,
	"energized" text NOT NULL,
	"last_heartbeat_at" timestamp,
	"last_event_at" timestamp,
	"last_seq" integer,
	"firmware_version" text,
	"device_health" text NOT NULL,
	"has_device" boolean NOT NULL,
	"battery_mv" integer,
	"rssi" integer,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "ck_energized_status" CHECK ("pole_states"."energized" IN ('LIVE', 'DARK', 'PRESUMED_DARK', 'UNKNOWN')),
	CONSTRAINT "ck_device_health" CHECK ("pole_states"."device_health" IN ('NO_DEVICE', 'HEALTHY', 'OFFLINE', 'DEGRADED'))
);
--> statement-breakpoint
CREATE TABLE "poles" (
	"pole_id" text PRIMARY KEY NOT NULL,
	"lat" double precision NOT NULL,
	"lon" double precision NOT NULL,
	"feeder_id" text NOT NULL,
	"dt_id" text NOT NULL,
	"seq_on_line" integer,
	"parent_pole_id" text,
	"pole_type" text,
	"ward" text,
	"pincode" text,
	"device_id" text,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scheduled_outages" (
	"outage_id" text PRIMARY KEY NOT NULL,
	"scope" text NOT NULL,
	"target_id" text NOT NULL,
	"scheduled_start" timestamp NOT NULL,
	"scheduled_end" timestamp NOT NULL,
	"reason" text,
	"created_at" timestamp NOT NULL,
	CONSTRAINT "ck_outage_scope" CHECK ("scheduled_outages"."scope" IN ('feeder', 'dt'))
);
--> statement-breakpoint
CREATE TABLE "telemetry_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"device_id" text NOT NULL,
	"pole_id" text NOT NULL,
	"event" text NOT NULL,
	"energized" boolean NOT NULL,
	"device_ts" timestamp NOT NULL,
	"seq" integer NOT NULL,
	"battery_mv" integer,
	"rssi" integer,
	"firmware" text,
	"received_at" timestamp NOT NULL,
	CONSTRAINT "ck_event_type" CHECK ("telemetry_events"."event" IN ('heartbeat', 'power_lost', 'power_restored', 'boot'))
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"ticket_id" uuid PRIMARY KEY NOT NULL,
	"fault_id" uuid NOT NULL,
	"status" text NOT NULL,
	"assigned_crew" text,
	"operator_notes" text,
	"rejection_count" integer DEFAULT 0 NOT NULL,
	"rejection_reason" text,
	"detected_at" timestamp NOT NULL,
	"acknowledged_at" timestamp,
	"crew_assigned_at" timestamp,
	"resolved_at" timestamp,
	"verified_at" timestamp,
	"closed_at" timestamp,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "ck_ticket_status" CHECK ("tickets"."status" IN ('detected', 'acknowledged', 'crew_assigned', 'resolved', 'verified', 'closed'))
);
--> statement-breakpoint
ALTER TABLE "distribution_transformers" ADD CONSTRAINT "distribution_transformers_feeder_id_feeders_feeder_id_fk" FOREIGN KEY ("feeder_id") REFERENCES "public"."feeders"("feeder_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faults" ADD CONSTRAINT "faults_dt_id_distribution_transformers_dt_id_fk" FOREIGN KEY ("dt_id") REFERENCES "public"."distribution_transformers"("dt_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faults" ADD CONSTRAINT "faults_feeder_id_feeders_feeder_id_fk" FOREIGN KEY ("feeder_id") REFERENCES "public"."feeders"("feeder_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faults" ADD CONSTRAINT "faults_span_pole_a_poles_pole_id_fk" FOREIGN KEY ("span_pole_a") REFERENCES "public"."poles"("pole_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faults" ADD CONSTRAINT "faults_span_pole_b_poles_pole_id_fk" FOREIGN KEY ("span_pole_b") REFERENCES "public"."poles"("pole_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faults" ADD CONSTRAINT "faults_merged_into_fault_id_faults_fault_id_fk" FOREIGN KEY ("merged_into_fault_id") REFERENCES "public"."faults"("fault_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pole_states" ADD CONSTRAINT "pole_states_pole_id_poles_pole_id_fk" FOREIGN KEY ("pole_id") REFERENCES "public"."poles"("pole_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poles" ADD CONSTRAINT "poles_feeder_id_feeders_feeder_id_fk" FOREIGN KEY ("feeder_id") REFERENCES "public"."feeders"("feeder_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poles" ADD CONSTRAINT "poles_dt_id_distribution_transformers_dt_id_fk" FOREIGN KEY ("dt_id") REFERENCES "public"."distribution_transformers"("dt_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poles" ADD CONSTRAINT "poles_parent_pole_id_poles_pole_id_fk" FOREIGN KEY ("parent_pole_id") REFERENCES "public"."poles"("pole_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telemetry_events" ADD CONSTRAINT "telemetry_events_pole_id_poles_pole_id_fk" FOREIGN KEY ("pole_id") REFERENCES "public"."poles"("pole_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_fault_id_faults_fault_id_fk" FOREIGN KEY ("fault_id") REFERENCES "public"."faults"("fault_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_faults_status" ON "faults" USING btree ("status") WHERE "faults"."status" = 'active';--> statement-breakpoint
CREATE INDEX "idx_faults_dt" ON "faults" USING btree ("dt_id");--> statement-breakpoint
CREATE INDEX "idx_faults_detected" ON "faults" USING btree ("detected_at" DESC);--> statement-breakpoint
CREATE INDEX "idx_poles_dt" ON "poles" USING btree ("dt_id");--> statement-breakpoint
CREATE INDEX "idx_poles_feeder" ON "poles" USING btree ("feeder_id");--> statement-breakpoint
CREATE INDEX "idx_poles_parent" ON "poles" USING btree ("parent_pole_id");--> statement-breakpoint
CREATE INDEX "idx_poles_device" ON "poles" USING btree ("device_id");--> statement-breakpoint
CREATE INDEX "idx_outages_time" ON "scheduled_outages" USING btree ("scheduled_start","scheduled_end");--> statement-breakpoint
CREATE INDEX "idx_outages_target" ON "scheduled_outages" USING btree ("scope","target_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_device_seq" ON "telemetry_events" USING btree ("device_id","seq");--> statement-breakpoint
CREATE INDEX "idx_telem_pole_received" ON "telemetry_events" USING btree ("pole_id","received_at" DESC);--> statement-breakpoint
CREATE INDEX "idx_telem_received" ON "telemetry_events" USING btree ("received_at" DESC);--> statement-breakpoint
CREATE UNIQUE INDEX "uq_ticket_fault" ON "tickets" USING btree ("fault_id");--> statement-breakpoint
CREATE INDEX "idx_tickets_status" ON "tickets" USING btree ("status") WHERE "tickets"."status" NOT IN ('verified', 'closed');--> statement-breakpoint
CREATE INDEX "idx_tickets_fault" ON "tickets" USING btree ("fault_id");
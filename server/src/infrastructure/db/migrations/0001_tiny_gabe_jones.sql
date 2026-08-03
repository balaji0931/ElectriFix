DROP INDEX "uq_device_seq";--> statement-breakpoint
ALTER TABLE "pole_states" ADD COLUMN "last_boot_counter" integer;--> statement-breakpoint
ALTER TABLE "telemetry_events" ADD COLUMN "boot_counter" integer;--> statement-breakpoint
UPDATE "telemetry_events" SET "boot_counter" = 0 WHERE "boot_counter" IS NULL;--> statement-breakpoint
ALTER TABLE "telemetry_events" ALTER COLUMN "boot_counter" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_device_boot_counter_seq" ON "telemetry_events" USING btree ("device_id","boot_counter","seq");

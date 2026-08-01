import { z } from "zod";

import { faultTypes, telemetryEventTypes } from "../../domain/contracts.js";

export const telemetryEventSchema = z.object({
  device_id: z.string().min(1),
  pole_id: z.string().min(1),
  event: z.enum(telemetryEventTypes),
  energized: z.boolean(),
  ts: z.iso.datetime(),
  seq: z.int().nonnegative(),
  battery_mv: z.int().optional(),
  rssi: z.int().optional(),
  fw: z.string().optional(),
});

export const telemetryBatchRequestSchema = z.object({
  events: z.array(telemetryEventSchema).max(500),
});

export const injectFaultRequestSchema = z.object({
  fault_type: z.enum(faultTypes),
  target_id: z.string().min(1),
  span_pole_a: z.string().min(1).optional(),
  span_pole_b: z.string().min(1).optional(),
  options: z.record(z.string(), z.unknown()).optional(),
});

export const repairFaultRequestSchema = z.object({
  fault_id: z.uuidv7(),
});

export const assignTicketRequestSchema = z.object({
  assigned_crew: z.string().min(1),
  operator_notes: z.string().optional(),
});

export const ticketActionRequestSchema = z.object({
  operator_notes: z.string().optional(),
});

export type TelemetryEventRequest = z.infer<typeof telemetryEventSchema>;
export type TelemetryBatchRequest = z.infer<typeof telemetryBatchRequestSchema>;
export type InjectFaultRequest = z.infer<typeof injectFaultRequestSchema>;
export type RepairFaultRequest = z.infer<typeof repairFaultRequestSchema>;
export type AssignTicketRequest = z.infer<typeof assignTicketRequestSchema>;
export type TicketActionRequest = z.infer<typeof ticketActionRequestSchema>;

import "dotenv/config";

import { z } from "zod";

const envSchema = z.object({
  APP_VERSION: z.string().min(1).default("1.0.0"),
  DATABASE_URL: z.string().url(),
  LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error", "fatal"])
    .default("info"),
  PORT: z.coerce.number().int().positive().default(3001),
});

export type Environment = z.infer<typeof envSchema>;

export function loadEnvironment(
  source: NodeJS.ProcessEnv = process.env,
): Environment {
  return envSchema.parse(source);
}

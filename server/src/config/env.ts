import "dotenv/config";

import { z } from "zod";

const envSchema = z.object({
  APP_VERSION: z.string().min(1).default("1.0.0"),
  DATABASE_URL: z.string().url(),
  LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error", "fatal"])
    .default("info"),
  PORT: z.coerce.number().int().positive().default(3001),
  AI_SUMMARIES_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  OPENROUTER_API_KEY: optionalEnvironmentString(),
  OPENROUTER_MODEL: optionalEnvironmentString(),
  OPENROUTER_BASE_URL: z.string().url().default("https://openrouter.ai/api/v1"),
  AI_SUMMARY_TIMEOUT_MS: z.coerce.number().int().positive().default(5_000),
});

function optionalEnvironmentString() {
  return z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().trim().min(1).optional(),
  );
}

export type Environment = z.infer<typeof envSchema>;

export function loadEnvironment(
  source: NodeJS.ProcessEnv = process.env,
): Environment {
  return envSchema.parse(source);
}

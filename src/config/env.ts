import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  REANIME_BASE_URL: z.string().url().default("https://reanime.cz"),
  HTTP_TIMEOUT_MS: z.coerce.number().int().positive().default(12_000),
  BROWSER_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  BROWSER_HEADLESS: z.string().default("true").transform((v) => v !== "false"),
  CACHE_TTL_SECONDS: z.coerce.number().int().nonnegative().default(60)
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(`Invalid environment configuration: ${parsed.error.message}`);
}

export const env = parsed.data;

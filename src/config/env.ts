import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  API_PREFIX: z.string().trim().min(1).default("/api/v1"),
  CORS_ORIGIN: z.string().trim().default("*"),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(300),
  SWAGGER_ENABLED: z.coerce.boolean().default(true),
  JWT_SECRET: z.string().trim().min(32),
  JWT_EXPIRES_IN: z.string().trim().min(1).default("1d"),
  DATABASE_URL: z.string().trim().url(),
  SARVAM_API_KEY: z.string().trim().min(1),
  SARVAM_API_URL: z
    .string()
    .trim()
    .url()
    .default("https://api.sarvam.ai/v1/chat/completions"),
  SARVAM_MODEL: z.string().trim().min(1).default("sarvam-30b"),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  const issues = parsedEnv.error.issues
    .map((issue) => `${issue.path.join(".") || "env"}: ${issue.message}`)
    .join("; ");

  throw new Error(`Invalid environment configuration: ${issues}`);
}

export const env = {
  nodeEnv: parsedEnv.data.NODE_ENV,
  port: parsedEnv.data.PORT,
  logLevel: parsedEnv.data.LOG_LEVEL,
  apiPrefix: parsedEnv.data.API_PREFIX,
  corsOrigin: parsedEnv.data.CORS_ORIGIN,
  rateLimitWindowMs: parsedEnv.data.RATE_LIMIT_WINDOW_MS,
  rateLimitMax: parsedEnv.data.RATE_LIMIT_MAX,
  swaggerEnabled: parsedEnv.data.SWAGGER_ENABLED,
  jwtSecret: parsedEnv.data.JWT_SECRET,
  jwtExpiresIn: parsedEnv.data.JWT_EXPIRES_IN,
  databaseUrl: parsedEnv.data.DATABASE_URL,
  sarvamApiKey: parsedEnv.data.SARVAM_API_KEY,
  sarvamApiUrl: parsedEnv.data.SARVAM_API_URL,
  sarvamModel: parsedEnv.data.SARVAM_MODEL,
} as const;

export type Env = typeof env;


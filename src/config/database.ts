import { URL } from "node:url";
import { env } from "./env";
import { prisma } from "../lib/prisma";
import { logger } from "./logger";

const globalForVercel = globalThis as unknown as {
  dbConnectionPromise?: Promise<void>;
};

/**
 * Idempotent DB connect for serverless (reuse one promise per isolate).
 * Use from Vercel middleware; local server uses {@link connectDatabase} at startup.
 */
export function ensureDatabaseConnection(): Promise<void> {
  if (!globalForVercel.dbConnectionPromise) {
    globalForVercel.dbConnectionPromise = connectDatabase().catch((error) => {
      globalForVercel.dbConnectionPromise = undefined;
      throw error;
    });
  }
  return globalForVercel.dbConnectionPromise;
}

export async function connectDatabase(): Promise<void> {
  const parsedUrl = new URL(env.databaseUrl);
  await prisma.$connect();

  logger.info(
    {
      provider: "prisma/postgresql",
      protocol: parsedUrl.protocol,
      host: parsedUrl.hostname,
      port: parsedUrl.port ? Number(parsedUrl.port) : 5432,
      database: parsedUrl.pathname.slice(1) || null,
    },
    "Database connected via Prisma",
  );
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
  logger.info("Database disconnected");
}


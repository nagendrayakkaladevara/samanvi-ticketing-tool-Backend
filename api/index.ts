import type { Request, Response } from "express";
import { createApp } from "../src/app";
import { connectDatabase } from "../src/config/database";
import { logger } from "../src/config/logger";

const app = createApp();

const globalForVercel = globalThis as unknown as {
  dbConnectionPromise?: Promise<void>;
};

function ensureDatabaseConnection(): Promise<void> {
  if (!globalForVercel.dbConnectionPromise) {
    globalForVercel.dbConnectionPromise = connectDatabase().catch((error) => {
      globalForVercel.dbConnectionPromise = undefined;
      throw error;
    });
  }

  return globalForVercel.dbConnectionPromise;
}

export default async function handler(req: Request, res: Response) {
  try {
    await ensureDatabaseConnection();
    return app(req, res);
  } catch (error) {
    logger.error({ err: error }, "Vercel request failed");
    res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Internal server error",
      },
    });
  }
}

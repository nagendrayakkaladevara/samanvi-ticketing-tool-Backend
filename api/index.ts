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

/**
 * Vercel awaits the default export; Express finishes the response asynchronously.
 * Wait until the response is closed/finished so the runtime does not freeze the function early.
 */
function runApp(req: Request, res: Response): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      res.removeListener("finish", onFinish);
      res.removeListener("close", onClose);
      res.removeListener("error", onError);
    };

    const onFinish = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };

    const onClose = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };

    const onError = (err: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    };

    res.once("finish", onFinish);
    res.once("close", onClose);
    res.once("error", onError);

    try {
      app(req, res);
    } catch (error) {
      onError(error);
    }
  });
}

export default async function handler(req: Request, res: Response) {
  try {
    await ensureDatabaseConnection();
    await runApp(req, res);
  } catch (error) {
    logger.error({ err: error }, "Vercel request failed");
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Internal server error",
        },
      });
    }
  }
}

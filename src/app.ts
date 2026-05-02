import cors from "cors";
import express from "express";
import helmet from "helmet";
import { ensureDatabaseConnection } from "./config/database";
import { env } from "./config/env";
import { logger } from "./config/logger";
import { errorHandler } from "./middleware/error-handler";
import { notFoundMiddleware } from "./middleware/not-found";
import { requestContextMiddleware } from "./middleware/request-context";
import { rootRouter } from "./routes";

export function createApp() {
  const app = express();

  if (process.env["VERCEL"] === "1") {
    app.set("trust proxy", 1);
  }

  app.disable("x-powered-by");
  app.use(
    helmet({
      crossOriginResourcePolicy: false,
    }),
  );
  app.use(
    cors({
      origin: env.corsOrigin === "*" ? true : env.corsOrigin,
      credentials: true,
    }),
  );
  app.use(requestContextMiddleware);
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true, limit: "1mb" }));

  if (process.env["VERCEL"] === "1") {
    app.use(async (_req, _res, next) => {
      try {
        await ensureDatabaseConnection();
        next();
      } catch (error) {
        next(error);
      }
    });
  }

  app.get("/", (_req, res) => {
    res.status(200).json({
      success: true,
      data: {
        service: "ticketing-api",
        env: env.nodeEnv,
      },
    });
  });

  app.use(rootRouter);
  app.use(notFoundMiddleware);
  app.use(errorHandler);

  logger.info(
    { env: env.nodeEnv, prefix: env.apiPrefix },
    "Application middleware initialized",
  );

  return app;
}


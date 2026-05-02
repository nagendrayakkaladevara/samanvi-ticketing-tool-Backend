import { createServer } from "node:http";
import { createApp } from "./app";
import { connectDatabase, disconnectDatabase } from "./config/database";
import { env } from "./config/env";
import { logger } from "./config/logger";

let server: ReturnType<typeof createServer> | undefined;

async function startServer(): Promise<void> {
  await connectDatabase();

  const app = createApp();
  server = createServer(app);
  server.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EADDRINUSE") {
      logger.fatal(
        { port: env.port },
        "Port already in use. Stop the existing process or change PORT in .env",
      );
      process.exit(1);
      return;
    }

    logger.fatal({ err: error }, "HTTP server failed");
    process.exit(1);
  });

  server.listen(env.port, () => {
    logger.info(
      { port: env.port, env: env.nodeEnv, apiPrefix: env.apiPrefix },
      "API server started",
    );
  });
}

startServer().catch((error) => {
  logger.fatal({ err: error }, "Failed to start server");
  process.exit(1);
});

function shutdown(signal: NodeJS.Signals): void {
  logger.warn({ signal }, "Shutdown signal received");
  if (!server) {
    disconnectDatabase()
      .catch((error) => {
        logger.error({ err: error }, "Error while disconnecting database");
      })
      .finally(() => {
        logger.info("Server was not started");
        process.exit(0);
      });
    return;
  }

  server.close(async (error) => {
    if (error) {
      logger.error({ err: error }, "Error while closing HTTP server");
      process.exit(1);
      return;
    }

    try {
      await disconnectDatabase();
      logger.info("HTTP server closed cleanly");
      process.exit(0);
    } catch (disconnectError) {
      logger.error({ err: disconnectError }, "HTTP server closed, DB disconnect failed");
      process.exit(1);
    }
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.on("uncaughtException", (error) => {
  logger.fatal({ err: error }, "Uncaught exception");
  process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  logger.fatal({ reason }, "Unhandled promise rejection");
  process.exit(1);
});


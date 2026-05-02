import pino from "pino";
import { env } from "./env";

/** pino-pretty is dev-only and is not bundled on Vercel; loading it crashes the worker. */
const usePrettyTransport =
  env.nodeEnv === "development" && process.env["VERCEL"] !== "1";

export const logger = pino({
  level: env.logLevel,
  base: {
    service: "ticketing-api",
    env: env.nodeEnv,
  },
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "res.headers['set-cookie']",
      "password",
      "token",
      "*.password",
      "*.token",
    ],
    censor: "[REDACTED]",
  },
  transport: usePrettyTransport
    ? {
        target: "pino-pretty",
        options: {
          colorize: true,
          singleLine: true,
          translateTime: "SYS:standard",
        },
      }
    : undefined,
});

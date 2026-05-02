import pino from "pino";
import { env } from "./env";

const isProduction = env.nodeEnv === "production";

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
  transport: isProduction
    ? undefined
    : {
        target: "pino-pretty",
        options: {
          colorize: true,
          singleLine: true,
          translateTime: "SYS:standard",
        },
      },
});

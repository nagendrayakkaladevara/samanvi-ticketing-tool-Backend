import rateLimit from "express-rate-limit";
import { env } from "../config/env";
import { AppError } from "../core/errors/app-error";

export const apiRateLimiter = rateLimit({
  windowMs: env.rateLimitWindowMs,
  limit: env.rateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: () =>
    new AppError({
      message: "Too many requests",
      statusCode: 429,
      code: "RATE_LIMITED",
      details: {
        windowMs: env.rateLimitWindowMs,
        max: env.rateLimitMax,
      },
    }),
});


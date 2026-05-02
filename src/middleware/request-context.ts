import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";
import pinoHttp from "pino-http";
import { logger } from "../config/logger";

const httpLogger = pinoHttp({
  logger,
  genReqId: (req) => {
    const id = req.headers["x-request-id"];
    if (typeof id === "string" && id.trim().length > 0) {
      return id;
    }
    return randomUUID();
  },
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return "error";
    if (res.statusCode >= 400) return "warn";
    return "info";
  },
});

export const requestContextMiddleware: RequestHandler = (req, res, next) => {
  httpLogger(req, res, () => {
    req.requestId = String(req.id);
    res.setHeader("x-request-id", req.requestId);
    next();
  });
};

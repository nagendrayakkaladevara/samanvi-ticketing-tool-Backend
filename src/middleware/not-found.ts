import type { RequestHandler } from "express";
import { notFound } from "../core/errors/http-errors";

export const notFoundMiddleware: RequestHandler = (req, _res, next) => {
  next(notFound(`Route ${req.method} ${req.originalUrl} not found`));
};

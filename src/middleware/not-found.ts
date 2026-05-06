import type { RequestHandler } from "express";
import { notFound } from "../core/errors/http-errors";

export const notFoundMiddleware: RequestHandler = (req, _res, next) => {
  next(
    notFound(`The requested endpoint was not found (${req.method} ${req.originalUrl})`),
  );
};

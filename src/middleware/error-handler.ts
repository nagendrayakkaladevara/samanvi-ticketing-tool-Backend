import type { ErrorRequestHandler } from "express";
import { AppError } from "../core/errors/app-error";

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const appError =
    err instanceof AppError
      ? err
      : new AppError({
          message: "Unexpected internal error",
          statusCode: 500,
          code: "INTERNAL_SERVER_ERROR",
          isOperational: false,
        });

  const requestId = req.requestId;
  const logPayload = {
    err,
    requestId,
    code: appError.code,
    isOperational: appError.isOperational,
  };

  if (req.log) {
    req.log.error(logPayload, "Request failed");
  } else {
    console.error("Request failed", logPayload);
  }

  const response = {
    success: false,
    error: {
      code: appError.code,
      message: appError.message,
      details: appError.details,
    },
    requestId,
  };

  res.status(appError.statusCode).json(response);
};

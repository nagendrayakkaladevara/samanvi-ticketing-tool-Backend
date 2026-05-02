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

  req.log.error(
    {
      err,
      requestId: req.requestId,
      code: appError.code,
      isOperational: appError.isOperational,
    },
    "Request failed",
  );

  const response = {
    success: false,
    error: {
      code: appError.code,
      message: appError.message,
      details: appError.details,
    },
    requestId: req.requestId,
  };

  res.status(appError.statusCode).json(response);
};

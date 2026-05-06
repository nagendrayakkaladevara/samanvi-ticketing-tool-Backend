import type { ErrorRequestHandler } from "express";
import { AppError } from "../core/errors/app-error";

function getUserFriendlyMessage(appError: AppError): string {
  if (appError.statusCode >= 500) {
    return "Something went wrong on our side. Please try again.";
  }

  switch (appError.statusCode) {
    case 400:
      return appError.message || "Invalid input. Please check the required fields.";
    case 401:
      return appError.message || "You need to sign in to continue.";
    case 403:
      return appError.message || "You do not have permission to perform this action.";
    case 404:
      return appError.message || "The requested resource was not found.";
    case 409:
      return appError.message || "This request could not be completed due to a conflict.";
    default:
      return appError.message || "Request could not be completed. Please try again.";
  }
}

function getTechnicalErrorMessage(err: unknown, appError: AppError): string {
  if (err instanceof Error && err.message.trim().length > 0) {
    return err.message;
  }
  return appError.message;
}

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
    message: getUserFriendlyMessage(appError),
    error: getTechnicalErrorMessage(err, appError),
    code: appError.code,
    details: appError.details,
    requestId,
  };

  res.status(appError.statusCode).json(response);
};

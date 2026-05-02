import { AppError, type AppErrorDetails } from "./app-error";

export function badRequest(message: string, details?: AppErrorDetails): AppError {
  return new AppError({ message, statusCode: 400, code: "BAD_REQUEST", details });
}

export function unauthorized(message = "Unauthorized"): AppError {
  return new AppError({ message, statusCode: 401, code: "UNAUTHORIZED" });
}

export function forbidden(message = "Forbidden"): AppError {
  return new AppError({ message, statusCode: 403, code: "FORBIDDEN" });
}

export function notFound(message = "Resource not found"): AppError {
  return new AppError({ message, statusCode: 404, code: "NOT_FOUND" });
}

export function conflict(message: string, details?: AppErrorDetails): AppError {
  return new AppError({ message, statusCode: 409, code: "CONFLICT", details });
}

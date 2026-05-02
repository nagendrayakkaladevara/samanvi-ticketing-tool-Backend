export interface AppErrorDetails {
  [key: string]: unknown;
}

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: AppErrorDetails;
  public readonly isOperational: boolean;

  constructor(args: {
    message: string;
    statusCode: number;
    code: string;
    details?: AppErrorDetails;
    isOperational?: boolean;
  }) {
    super(args.message);
    this.name = "AppError";
    this.statusCode = args.statusCode;
    this.code = args.code;
    this.details = args.details;
    this.isOperational = args.isOperational ?? true;
    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

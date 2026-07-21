import type { Request, Response, NextFunction, RequestHandler } from "express";
import type { ErrorResponse, Role } from "../../types/express";

export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  static badRequest(code: string, message: string): ApiError {
    return new ApiError(400, code, message);
  }

  static unauthorized(message = "Authentication required"): ApiError {
    return new ApiError(401, "UNAUTHORIZED", message);
  }

  static forbidden(message = "Insufficient permissions"): ApiError {
    return new ApiError(403, "FORBIDDEN", message);
  }

  static notFound(message = "Resource not found"): ApiError {
    return new ApiError(404, "NOT_FOUND", message);
  }
}

export function sendError(res: Response, statusCode: number, code: string, message: string): void {
  const body: ErrorResponse = { status_code: statusCode, error: code, message };
  res.status(statusCode).json(body);
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ApiError) {
    sendError(res, err.statusCode, err.code, err.message);
    return;
  }
  console.error("[unhandled error]", err);
  sendError(res, 500, "INTERNAL_ERROR", "Internal server error");
}

export function asyncHandler<T = unknown>(fn: (req: Request, res: Response, next: NextFunction) => Promise<T>): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

const ROLE_RANK: Record<Role, number> = {
  VIEWER: 0,
  MEMBER: 1,
  ADMIN: 2,
  OWNER: 3,
};

export function roleAtLeast(userRole: Role, minRole: Role): boolean {
  return ROLE_RANK[userRole] >= ROLE_RANK[minRole];
}

// ============================================================
// errors.ts — shared application error type + HTTP response mapping
//
// Every module throws AppError (or one of the generic subclasses below)
// for expected failure cases; sendError() maps it to the documented
// { status_code, error, message } response shape in one place instead of
// each controller re-implementing its own instanceof chain.
// ============================================================
import type { ErrorRequestHandler, Response } from 'express';
import { ZodError } from 'zod';

export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super('NOT_FOUND', 404, message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super('FORBIDDEN', 403, message);
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Bad request') {
    super('BAD_REQUEST', 400, message);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Conflict') {
    super('CONFLICT', 409, message);
  }
}

export function sendError(res: Response, error: unknown): void {
  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      status_code: error.statusCode,
      error: error.code,
      message: error.message,
    });
    return;
  }

  if (error instanceof ZodError) {
    res.status(400).json({
      status_code: 400,
      error: 'VALIDATION_ERROR',
      message: error.issues[0]?.message ?? 'Invalid request',
    });
    return;
  }

  console.error(error);
  res.status(500).json({
    status_code: 500,
    error: 'INTERNAL_ERROR',
    message: 'Internal server error',
  });
}

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  sendError(res, error)
}

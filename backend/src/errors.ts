// ============================================================
// errors.ts — 애플리케이션 오류와 HTTP 응답 형식의 공통 매핑
//
// 예상 가능한 실패는 각 서비스가 AppError 계열로 표현하고, 이 모듈이
// { status_code, error, message } 응답으로 일괄 변환한다. 컨트롤러마다
// 오류 타입 분기를 반복하지 않고 모든 API의 오류 정책을 동일하게 유지하기 위함이다.
// ============================================================
import type { ErrorRequestHandler, Response } from 'express'
import { ZodError } from 'zod'
import { MulterError } from 'multer'

export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly statusCode: number,
    message: string,
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super('NOT_FOUND', 404, message)
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super('FORBIDDEN', 403, message)
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Bad request') {
    super('BAD_REQUEST', 400, message)
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Conflict') {
    super('CONFLICT', 409, message)
  }
}

function sendError(res: Response, error: unknown): void {
  // 도메인 오류, 업로드 오류, 입력 검증 오류 순으로 알려진 실패를 안전하게 노출한다.
  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      status_code: error.statusCode,
      error: error.code,
      message: error.message,
    })
    return
  }

  if (error instanceof MulterError) {
    const statusCode = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400
    res.status(statusCode).json({
      status_code: statusCode,
      error: statusCode === 413 ? 'PAYLOAD_TOO_LARGE' : 'BAD_REQUEST',
      message: statusCode === 413 ? 'Request body is too large' : error.message,
    })
    return
  }

  if (error instanceof ZodError) {
    res.status(400).json({
      status_code: 400,
      error: 'VALIDATION_ERROR',
      message: error.issues[0]?.message ?? 'Invalid request',
    })
    return
  }

  const httpStatus = getClientErrorStatus(error)
  if (httpStatus !== null) {
    res.status(httpStatus).json({
      status_code: httpStatus,
      error: httpStatus === 413 ? 'PAYLOAD_TOO_LARGE' : 'BAD_REQUEST',
      message: httpStatus === 413 ? 'Request body is too large' : 'Invalid request',
    })
    return
  }

  // 분류되지 않은 내부 오류의 상세는 로그에만 남기고 클라이언트에는 숨긴다.
  console.error(error)
  res.status(500).json({
    status_code: 500,
    error: 'INTERNAL_ERROR',
    message: 'Internal server error',
  })
}

function getClientErrorStatus(error: unknown): number | null {
  if (typeof error !== 'object' || error === null) return null

  const candidate = error as { status?: unknown; statusCode?: unknown }
  const status =
    typeof candidate.status === 'number'
      ? candidate.status
      : typeof candidate.statusCode === 'number'
        ? candidate.statusCode
        : null

  return status !== null && Number.isInteger(status) && status >= 400 && status < 500
    ? status
    : null
}

export const errorHandler: ErrorRequestHandler = (error, _req, res, next) => {
  if (res.headersSent) {
    next(error)
    return
  }
  sendError(res, error)
}

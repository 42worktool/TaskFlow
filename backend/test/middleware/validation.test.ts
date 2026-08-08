// 요청 매개변수 검증과 구조화된 유효성 오류의 전달을 검증한다.
import assert from 'node:assert/strict'
import test from 'node:test'
import type { NextFunction, Request, Response } from 'express'
import { ZodError } from 'zod'
import { uuidParam } from '../../src/middleware/validation'

function requestWithParam(name: string, value: string): Request {
  return { params: { [name]: value } } as unknown as Request
}

test('UUID param middleware validates and normalizes route params', () => {
  const name = 'resourceId'
  const value = 'AAAAAAAA-0000-4000-8000-000000000001'
  const req = requestWithParam(name, value)
  let nextError: unknown = Symbol('not-called')

  uuidParam(
    req,
    {} as Response,
    ((error?: unknown) => {
      nextError = error
    }) as NextFunction,
    value,
    name,
  )

  assert.equal(nextError, undefined)
  assert.equal(req.params[name], value.toLowerCase())
})

test('UUID param middleware forwards Zod errors', () => {
  const name = 'resourceId'
  const req = requestWithParam(name, 'not-a-uuid')
  let nextError: unknown

  uuidParam(
    req,
    {} as Response,
    ((error?: unknown) => {
      nextError = error
    }) as NextFunction,
    req.params[name],
    name,
  )

  assert.ok(nextError instanceof ZodError)
  assert.equal(req.params[name], 'not-a-uuid')
})

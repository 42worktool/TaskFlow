// 이메일과 UUID처럼 여러 API 경계에서 반복되는 정규화·검증 규칙을 공유한다.
import { z } from 'zod'

export const normalizedEmailSchema = z
  .string()
  .transform(normalizeEmail)
  .pipe(z.string().email().max(254))

export const uuidSchema = z.string().uuid().toLowerCase()

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

import { z } from 'zod'

export const normalizedEmailSchema = z
  .string()
  .transform(normalizeEmail)
  .pipe(z.string().email().max(254))

export const uuidSchema = z.string().uuid().toLowerCase()

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

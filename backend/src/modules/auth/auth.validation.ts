import { z } from 'zod'

const linkedInUrlSchema = z
  .union([z.string().trim().max(2048), z.null()])
  .transform((value, context): string | null => {
    if (value === null || value === '') return null

    let url: URL
    try {
      url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`)
    } catch {
      context.addIssue({ code: 'custom', message: 'LinkedIn URL is invalid' })
      return z.NEVER
    }

    const hostname = url.hostname.toLowerCase()
    if (
      url.protocol !== 'https:' ||
      (hostname !== 'linkedin.com' && !hostname.endsWith('.linkedin.com'))
    ) {
      context.addIssue({ code: 'custom', message: 'A secure LinkedIn URL is required' })
      return z.NEVER
    }

    return url.toString()
  })

export const updateAccountSchema = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    headline: z
      .string()
      .trim()
      .min(1)
      .max(160)
      .refine((value) => !/[\r\n]/.test(value), 'Headline must be a single line')
      .optional(),
    linkedin_url: linkedInUrlSchema.optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.name !== undefined || value.headline !== undefined || value.linkedin_url !== undefined,
    'At least one profile field is required',
  )

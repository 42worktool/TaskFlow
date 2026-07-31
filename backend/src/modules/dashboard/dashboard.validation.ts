import { z } from 'zod'

type DashboardPeriod = 7 | 30 | 90 | 365

export const dashboardQuerySchema = z
  .object({
    period: z
      .enum(['7', '30', '90', '365'])
      .default('30')
      .transform((value): DashboardPeriod => Number(value) as DashboardPeriod),
  })
  .strict()

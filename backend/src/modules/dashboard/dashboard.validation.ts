// 허용할 대시보드 집계 기간을 제한하고 서비스가 숫자 기간만 받도록 변환한다.
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

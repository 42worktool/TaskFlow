// 대시보드가 지원하는 기간과 기본 조회 기간을 검증한다.
import assert from 'node:assert/strict'
import test from 'node:test'
import { dashboardQuerySchema } from '../../../src/modules/dashboard/dashboard.validation'

test('dashboard query accepts only supported periods and defaults to 30 days', () => {
  assert.deepEqual(dashboardQuerySchema.parse({}), { period: 30 })
  for (const period of ['7', '30', '90', '365']) {
    assert.deepEqual(dashboardQuerySchema.parse({ period }), {
      period: Number(period),
    })
  }

  for (const period of ['0', '14', '366', 'all']) {
    assert.throws(() => dashboardQuerySchema.parse({ period }))
  }
  assert.throws(() => dashboardQuerySchema.parse({ period: '30', unexpected: true }))
})

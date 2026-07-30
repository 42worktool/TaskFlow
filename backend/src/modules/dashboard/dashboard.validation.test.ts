import assert from 'node:assert/strict'
import test from 'node:test'
import {
  dashboardParamsSchema,
  dashboardQuerySchema,
} from './dashboard.validation'

test('dashboard params require only a UUID workspace id', () => {
  const workspaceId = '00000000-0000-4000-8000-000000000001'
  assert.deepEqual(dashboardParamsSchema.parse({ workspaceId }), {
    workspaceId,
  })
  assert.throws(() => dashboardParamsSchema.parse({ workspaceId: 'invalid' }))
  assert.throws(() =>
    dashboardParamsSchema.parse({ workspaceId, unexpected: true }),
  )
})

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
  assert.throws(() =>
    dashboardQuerySchema.parse({ period: '30', unexpected: true }),
  )
})

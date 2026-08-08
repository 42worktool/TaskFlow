// 대시보드 집계 요청과 기간 쿼리 직렬화를 검증한다.
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/services/auth', () => ({
  apiRequest: vi.fn(),
}))

import { apiRequest } from '../../src/services/auth'
import { DashboardAPI } from '../../src/api/dashboard'

describe('DashboardAPI', () => {
  beforeEach(() => {
    vi.mocked(apiRequest).mockReset()
  })

  it('loads the aggregate dashboard for one workspace', async () => {
    vi.mocked(apiRequest).mockResolvedValue({ summary: {} })

    await DashboardAPI.get('workspace-1', 90)

    expect(apiRequest).toHaveBeenCalledWith('/api/workspaces/workspace-1/dashboard?period=90')
  })

  it('defaults the dashboard period to 30 days', async () => {
    vi.mocked(apiRequest).mockResolvedValue({ summary: {} })

    await DashboardAPI.get('workspace-1')

    expect(apiRequest).toHaveBeenCalledWith('/api/workspaces/workspace-1/dashboard?period=30')
  })
})

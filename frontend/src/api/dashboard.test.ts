import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../services/auth', () => ({
  apiRequest: vi.fn(),
}))

import { apiRequest } from '../services/auth'
import { DashboardAPI } from './dashboard'

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

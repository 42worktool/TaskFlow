import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../services/auth', () => ({
  apiRequest: vi.fn(),
}))

import { WorkspaceAPI } from './workspace'
import { apiRequest } from '../services/auth'

describe('WorkspaceAPI', () => {
  beforeEach(() => {
    vi.mocked(apiRequest).mockReset()
  })

  it('updates an eligible member role through the workspace endpoint', async () => {
    const workspace = {
      id: 'workspace-1',
      members: [],
    }
    vi.mocked(apiRequest).mockResolvedValueOnce(workspace)

    await expect(
      WorkspaceAPI.changeMemberRole('workspace-1', 'member-1', 'ADMIN'),
    ).resolves.toBe(workspace)

    expect(apiRequest).toHaveBeenCalledWith(
      '/api/workspaces/workspace-1/members/member-1',
      {
        method: 'PUT',
        json: { role: 'ADMIN' },
      },
    )
  })
})

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

    await expect(WorkspaceAPI.changeMemberRole('workspace-1', 'member-1', 'ADMIN')).resolves.toBe(
      workspace,
    )

    expect(apiRequest).toHaveBeenCalledWith('/api/workspaces/workspace-1/members/member-1', {
      method: 'PUT',
      json: { role: 'ADMIN' },
    })
  })

  it('transfers ownership and leaves through dedicated endpoints', async () => {
    vi.mocked(apiRequest)
      .mockResolvedValueOnce({ id: 'workspace-1' })
      .mockResolvedValueOnce(undefined)

    await WorkspaceAPI.transferOwnership('workspace-1', 'member-1')
    await WorkspaceAPI.leave('workspace-1')

    expect(apiRequest).toHaveBeenNthCalledWith(
      1,
      '/api/workspaces/workspace-1/ownership/member-1',
      { method: 'PUT' },
    )
    expect(apiRequest).toHaveBeenNthCalledWith(2, '/api/workspaces/workspace-1/membership', {
      method: 'DELETE',
    })
  })

  it('previews an invitation before explicitly accepting it', async () => {
    const preview = {
      workspace_name: 'Design',
      role: 'MEMBER' as const,
      already_member: false,
    }
    vi.mocked(apiRequest).mockResolvedValueOnce(preview).mockResolvedValueOnce({
      id: 'workspace-1',
    })

    await expect(WorkspaceAPI.previewInvite('invite-token')).resolves.toBe(preview)
    await WorkspaceAPI.acceptInvite('invite-token')

    expect(apiRequest).toHaveBeenNthCalledWith(1, '/api/workspaces/invite/invite-token')
    expect(apiRequest).toHaveBeenNthCalledWith(2, '/api/workspaces/invite/invite-token', {
      method: 'POST',
    })
  })
})

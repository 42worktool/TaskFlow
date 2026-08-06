import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../services/auth', () => ({
  apiRequest: vi.fn(),
}))

import { apiRequest } from '../services/auth'
import { LabelAPI } from './label'

describe('LabelAPI', () => {
  beforeEach(() => {
    vi.mocked(apiRequest).mockReset()
  })

  it('lists and creates workspace labels', async () => {
    const label = {
      id: 'label-1',
      workspace_id: 'workspace-1',
      label_name: 'Bug',
      label_color: '#EF4444',
      created_at: '2026-08-03T12:00:00.000Z',
    }
    vi.mocked(apiRequest).mockResolvedValueOnce([label]).mockResolvedValueOnce(label)

    await expect(LabelAPI.list('workspace-1')).resolves.toEqual([label])
    await expect(
      LabelAPI.create('workspace-1', {
        label_name: 'Bug',
        label_color: '#EF4444',
      }),
    ).resolves.toEqual(label)

    expect(apiRequest).toHaveBeenNthCalledWith(1, '/api/workspaces/workspace-1/labels')
    expect(apiRequest).toHaveBeenNthCalledWith(2, '/api/workspaces/workspace-1/labels', {
      method: 'POST',
      json: { label_name: 'Bug', label_color: '#EF4444' },
    })
  })

  it('updates a label', async () => {
    const label = {
      id: 'label-1',
      workspace_id: 'workspace-1',
      label_name: 'Critical',
      label_color: '#DC2626',
      created_at: '2026-08-03T12:00:00.000Z',
    }
    vi.mocked(apiRequest).mockResolvedValueOnce(label)

    await expect(
      LabelAPI.update('label-1', {
        label_name: 'Critical',
        label_color: '#DC2626',
      }),
    ).resolves.toEqual(label)
    expect(apiRequest).toHaveBeenCalledWith('/api/labels/label-1', {
      method: 'PUT',
      json: { label_name: 'Critical', label_color: '#DC2626' },
    })
  })

  it('attaches and detaches card labels', async () => {
    vi.mocked(apiRequest).mockResolvedValue(undefined)

    await LabelAPI.attach('card-1', 'label-1')
    await LabelAPI.detach('card-1', 'label-1')
    await LabelAPI.remove('label-1')

    expect(apiRequest).toHaveBeenNthCalledWith(1, '/api/cards/card-1/labels', {
      method: 'POST',
      json: { label_id: 'label-1' },
    })
    expect(apiRequest).toHaveBeenNthCalledWith(2, '/api/cards/card-1/labels/label-1', {
      method: 'DELETE',
    })
    expect(apiRequest).toHaveBeenNthCalledWith(3, '/api/labels/label-1', {
      method: 'DELETE',
    })
  })
})

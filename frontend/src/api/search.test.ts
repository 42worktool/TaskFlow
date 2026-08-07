import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../services/auth', () => ({ apiRequest: vi.fn() }))

import { apiRequest } from '../services/auth'
import { SearchAPI } from './search'

describe('SearchAPI', () => {
  beforeEach(() => {
    vi.mocked(apiRequest).mockReset()
  })

  it('serializes unified search filters', async () => {
    vi.mocked(apiRequest).mockResolvedValue({
      items: [],
      page: 2,
      limit: 10,
      total: 0,
      total_pages: 1,
    })

    await SearchAPI.search({
      query: 'product roadmap',
      type: 'card',
      workspaceId: 'workspace-1',
      labelId: 'label-1',
      sort: 'newest',
      page: 2,
      limit: 10,
    })

    expect(apiRequest).toHaveBeenCalledWith(
      '/api/search?q=product+roadmap&type=card&workspace_id=workspace-1&label_id=label-1&sort=newest&page=2&limit=10',
    )
  })

  it('extracts user results from the unified response', async () => {
    vi.mocked(apiRequest).mockResolvedValue({
      items: [
        {
          kind: 'user',
          id: 'user-1',
          name: 'Profile User',
          profile_image_url: null,
          headline: 'Developer',
          linkedin_url: null,
          created_at: '2026-08-06T00:00:00.000Z',
        },
      ],
      page: 1,
      limit: 5,
      total: 1,
      total_pages: 1,
    })

    await expect(SearchAPI.users('profile', 'workspace-1', 5)).resolves.toEqual([
      {
        kind: 'user',
        id: 'user-1',
        name: 'Profile User',
        profile_image_url: null,
        headline: 'Developer',
        linkedin_url: null,
        created_at: '2026-08-06T00:00:00.000Z',
      },
    ])
    expect(apiRequest).toHaveBeenCalledWith(
      '/api/search?q=profile&type=user&workspace_id=workspace-1&limit=5',
    )
  })
})

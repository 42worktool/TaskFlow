import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../services/auth', () => ({
  apiRequest: vi.fn(),
}))

vi.mock('../services/fileTransfer', () => ({
  uploadFile: vi.fn(),
  fetchBlob: vi.fn(),
  downloadFile: vi.fn(),
}))

import { CardAPI } from './card'
import { apiRequest } from '../services/auth'
import { downloadFile, fetchBlob, uploadFile } from '../services/fileTransfer'

describe('CardAPI', () => {
  beforeEach(() => {
    vi.mocked(apiRequest).mockReset()
    vi.mocked(uploadFile).mockReset()
    vi.mocked(fetchBlob).mockReset()
    vi.mocked(downloadFile).mockReset()
  })

  it('moves a card to the signed-in user inbox', async () => {
    const moved = {
      id: 'card-1',
      list_id: null,
      title: 'Inbox card',
      description: null,
      start_at: null,
      deadline: null,
      sequence: 1,
      created_at: '2026-07-29T00:00:00.000Z',
    }
    vi.mocked(apiRequest).mockResolvedValueOnce(moved)

    await expect(CardAPI.moveToInbox('card-1')).resolves.toEqual(moved)
    expect(apiRequest).toHaveBeenCalledWith('/api/cards/card-1/inbox', {
      method: 'PUT',
    })
  })

  it('loads and updates card detail fields through the existing routes', async () => {
    const request = vi.mocked(apiRequest)
    request
      .mockResolvedValueOnce({
        id: 'card-1',
        members: [],
        labels: [],
        attachments: [],
        comments: [],
      })
      .mockResolvedValueOnce({ id: 'card-1', title: 'Updated' })
      .mockResolvedValueOnce({
        id: 'card-1',
        start_at: '2026-07-29T00:00:00.000Z',
        deadline: null,
      })

    await CardAPI.get('card-1')
    await CardAPI.update('card-1', {
      title: 'Updated',
      description: 'Details',
    })
    await CardAPI.updateDates('card-1', {
      start_at: '2026-07-29T00:00:00.000Z',
      deadline: null,
    })

    expect(request).toHaveBeenNthCalledWith(1, '/api/cards/card-1')
    expect(request).toHaveBeenNthCalledWith(2, '/api/cards/card-1', {
      method: 'PUT',
      json: {
        title: 'Updated',
        description: 'Details',
      },
    })
    expect(request).toHaveBeenNthCalledWith(3, '/api/cards/card-1/dates', {
      method: 'PATCH',
      json: {
        start_at: '2026-07-29T00:00:00.000Z',
        deadline: null,
      },
    })
  })

  it('creates a comment directly on a card', async () => {
    const created = {
      id: 'comment-1',
      card_id: 'card-1',
      author: {
        user_id: 'user-1',
        name: 'User',
        profile_image_url: null,
      },
      comment_str: 'Direct comment',
      created_at: '2026-07-30T00:00:00.000Z',
      updated_at: '2026-07-30T00:00:00.000Z',
    }
    vi.mocked(apiRequest).mockResolvedValueOnce(created)

    await expect(
      CardAPI.createComment('card-1', 'Direct comment'),
    ).resolves.toEqual(created)
    expect(apiRequest).toHaveBeenCalledWith('/api/cards/card-1/comments', {
      method: 'POST',
      json: { comment_str: 'Direct comment' },
    })
  })

  it('removes a comment through the comment route', async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce(undefined)

    await CardAPI.removeComment('comment-1')

    expect(apiRequest).toHaveBeenCalledWith(
      '/api/cards/comments/comment-1',
      { method: 'DELETE' },
    )
  })

  it('updates completion without moving the card to another list', async () => {
    const completed = {
      id: 'card-1',
      list_id: 'list-1',
      is_completed: true,
    }
    vi.mocked(apiRequest).mockResolvedValueOnce(completed)

    await expect(
      CardAPI.updateCompletion('card-1', true),
    ).resolves.toEqual(completed)
    expect(apiRequest).toHaveBeenCalledWith(
      '/api/cards/card-1/completion',
      {
        method: 'PATCH',
        json: { is_completed: true },
      },
    )
  })

  it('uploads an attachment through the generic file-transfer helper', async () => {
    const attachment = {
      id: 'attachment-1',
      card_id: 'card-1',
      file_url: '/api/cards/attachments/attachment-1/download',
      file_name: 'notes.pdf',
      mime_type: 'application/pdf',
      size_bytes: 2048,
      created_at: '2026-07-30T00:00:00.000Z',
    }
    vi.mocked(uploadFile).mockResolvedValueOnce(attachment)
    const file = new File(['content'], 'notes.pdf', { type: 'application/pdf' })
    const onProgress = vi.fn()

    await expect(
      CardAPI.uploadAttachment('card-1', file, onProgress),
    ).resolves.toEqual(attachment)
    expect(uploadFile).toHaveBeenCalledWith(
      '/api/cards/card-1/attachments',
      file,
      onProgress,
    )
  })

  it('removes an attachment', async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce(undefined)

    await CardAPI.removeAttachment('attachment-1')

    expect(apiRequest).toHaveBeenCalledWith(
      '/api/cards/attachments/attachment-1',
      { method: 'DELETE' },
    )
  })

  it('downloads an attachment through the generic file-transfer helper', async () => {
    vi.mocked(downloadFile).mockResolvedValueOnce(undefined)

    await CardAPI.downloadAttachment('attachment-1', 'notes.pdf')

    expect(downloadFile).toHaveBeenCalledWith(
      '/api/cards/attachments/attachment-1/download',
      'notes.pdf',
    )
  })

  it('fetches an attachment blob through the generic file-transfer helper', async () => {
    const blob = new Blob(['content'])
    vi.mocked(fetchBlob).mockResolvedValueOnce(blob)

    await expect(CardAPI.fetchAttachmentBlob('attachment-1')).resolves.toBe(blob)
    expect(fetchBlob).toHaveBeenCalledWith(
      '/api/cards/attachments/attachment-1/download',
    )
  })
})

import { describe, expect, it } from 'vitest'
import {
  criteriaFromRouteQuery,
  criteriaToRouteQuery,
  matchesSearchText,
  parseSearchExpression,
} from './searchQuery'

describe('advanced search query parsing', () => {
  it('parses category, workspace, label and free-text commands', () => {
    expect(
      parseSearchExpression(
        '/card /workspace:"TaskFlow Product" /label:backend websocket reconnect',
      ),
    ).toEqual({
      text: 'websocket reconnect',
      category: 'card',
      workspace: 'TaskFlow Product',
      label: 'backend',
    })
  })

  it('supports aliases and treats an unknown slash token as a keyword', () => {
    expect(parseSearchExpression('/type:workspace /in:public /oauth')).toEqual({
      text: 'oauth',
      category: 'workspace',
      workspace: 'public',
      label: null,
    })
  })

  it('supports the user category command', () => {
    expect(parseSearchExpression('/user product developer')).toEqual({
      text: 'product developer',
      category: 'user',
      workspace: null,
      label: null,
    })
  })

  it('treats a leading mention as a user search shortcut', () => {
    expect(parseSearchExpression('@프로필 사용자')).toEqual({
      text: '프로필 사용자',
      category: 'user',
      workspace: null,
      label: null,
    })
  })

  it('preserves invalid scoped commands as searchable text', () => {
    expect(parseSearchExpression('/type:person kim')).toEqual({
      text: 'type:person kim',
      category: 'all',
      workspace: null,
      label: null,
    })
  })

  it('ignores a label scope until a workspace scope is present', () => {
    expect(parseSearchExpression('/label:backend websocket')).toEqual({
      text: 'websocket',
      category: 'all',
      workspace: null,
      label: null,
    })
  })

  it('can use the current workspace as the label command context', () => {
    expect(parseSearchExpression('/label:backend websocket', 'workspace-id')).toEqual({
      text: 'websocket',
      category: 'all',
      workspace: 'workspace-id',
      label: 'backend',
    })
  })
})

describe('advanced search route state', () => {
  it('round-trips populated route filters', () => {
    const criteria = criteriaFromRouteQuery({
      q: 'oauth',
      type: 'card',
      workspace: 'workspace-id',
      label: 'label-id',
    })

    expect(criteriaToRouteQuery(criteria)).toEqual({
      q: 'oauth',
      type: 'card',
      workspace: 'workspace-id',
      label: 'label-id',
    })
  })

  it('drops empty and default filters from the route', () => {
    expect(
      criteriaToRouteQuery({ text: '', category: 'all', workspace: null, label: null }),
    ).toEqual({})
  })

  it('drops a label when no workspace is selected', () => {
    const criteria = criteriaFromRouteQuery({ q: 'oauth', label: 'label-id' })

    expect(criteria.label).toBeNull()
    expect(
      criteriaToRouteQuery({
        text: 'oauth',
        category: 'card',
        workspace: null,
        label: 'label-id',
      }),
    ).toEqual({ q: 'oauth', type: 'card' })
  })

  it('drops a label from categories where labels do not apply', () => {
    expect(
      criteriaFromRouteQuery({
        q: 'profile',
        type: 'user',
        workspace: 'workspace-id',
        label: 'label-id',
      }),
    ).toEqual({
      text: 'profile',
      category: 'user',
      workspace: 'workspace-id',
      label: null,
    })
  })
})

describe('advanced search text matching', () => {
  it('requires every keyword but allows them in different fields', () => {
    expect(matchesSearchText(['OAuth callback', 'Backend security'], 'oauth backend')).toBe(true)
    expect(matchesSearchText(['OAuth callback', 'Frontend'], 'oauth backend')).toBe(false)
  })
})

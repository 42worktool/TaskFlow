import { describe, expect, it } from 'vitest'
import {
  compareSearchSortValues,
  criteriaFromRouteQuery,
  criteriaToRouteQuery,
  matchesSearchText,
  paginationPages,
  parseSearchExpression,
} from './searchQuery'

const defaultRouteState = {
  sort: 'relevance' as const,
  page: 1,
}

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
      ...defaultRouteState,
    })
  })

  it('supports aliases and treats an unknown slash token as a keyword', () => {
    expect(parseSearchExpression('/type:workspace /in:public /oauth')).toEqual({
      text: 'oauth',
      category: 'workspace',
      workspace: 'public',
      label: null,
      ...defaultRouteState,
    })
  })

  it('supports the user category command', () => {
    expect(parseSearchExpression('/user product developer')).toEqual({
      text: 'product developer',
      category: 'user',
      workspace: null,
      label: null,
      ...defaultRouteState,
    })
  })

  it('treats a leading mention as a user search shortcut', () => {
    expect(parseSearchExpression('@프로필 사용자')).toEqual({
      text: '프로필 사용자',
      category: 'user',
      workspace: null,
      label: null,
      ...defaultRouteState,
    })
  })

  it('preserves invalid scoped commands as searchable text', () => {
    expect(parseSearchExpression('/type:person kim')).toEqual({
      text: 'type:person kim',
      category: 'all',
      workspace: null,
      label: null,
      ...defaultRouteState,
    })
  })

  it('ignores a label scope until a workspace scope is present', () => {
    expect(parseSearchExpression('/label:backend websocket')).toEqual({
      text: 'websocket',
      category: 'all',
      workspace: null,
      label: null,
      ...defaultRouteState,
    })
  })

  it('can use the current workspace as the label command context', () => {
    expect(parseSearchExpression('/label:backend websocket', 'workspace-id')).toEqual({
      text: 'websocket',
      category: 'all',
      workspace: 'workspace-id',
      label: 'backend',
      ...defaultRouteState,
    })
  })

  it('parses sorting aliases and always starts a new expression on page one', () => {
    expect(parseSearchExpression('/sort:recent /card oauth')).toEqual({
      text: 'oauth',
      category: 'card',
      workspace: null,
      label: null,
      sort: 'newest',
      page: 1,
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
      sort: 'newest',
      page: '3',
    })

    expect(criteriaToRouteQuery(criteria)).toEqual({
      q: 'oauth',
      type: 'card',
      workspace: 'workspace-id',
      label: 'label-id',
      sort: 'newest',
      page: '3',
    })
  })

  it('drops empty and default filters from the route', () => {
    expect(
      criteriaToRouteQuery({
        text: '',
        category: 'all',
        workspace: null,
        label: null,
        ...defaultRouteState,
      }),
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
        ...defaultRouteState,
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
      ...defaultRouteState,
    })
  })

  it('normalizes unsupported sort and page values', () => {
    expect(criteriaFromRouteQuery({ sort: 'oldest', page: '-2' })).toEqual({
      text: '',
      category: 'all',
      workspace: null,
      label: null,
      ...defaultRouteState,
    })
    expect(criteriaFromRouteQuery({ page: '2nd' }).page).toBe(1)
  })
})

describe('advanced search text matching', () => {
  it('requires every keyword but allows them in different fields', () => {
    expect(matchesSearchText(['OAuth callback', 'Backend security'], 'oauth backend')).toBe(true)
    expect(matchesSearchText(['OAuth callback', 'Frontend'], 'oauth backend')).toBe(false)
  })
})

describe('advanced search sorting and pagination', () => {
  const alpha = {
    name: 'Alpha card',
    createdAt: '2026-01-01T00:00:00.000Z',
    searchable: ['Alpha card', 'frontend'],
  }
  const beta = {
    name: 'Beta card',
    createdAt: '2026-02-01T00:00:00.000Z',
    searchable: ['Beta card', 'alpha backend'],
  }

  it('sorts exact title matches ahead of secondary-field matches by relevance', () => {
    expect(
      [beta, alpha].sort((left, right) =>
        compareSearchSortValues(left, right, 'relevance', 'alpha'),
      ),
    ).toEqual([alpha, beta])
  })

  it('supports newest and alphabetical ordering', () => {
    expect(
      [alpha, beta].sort((left, right) => compareSearchSortValues(left, right, 'newest', '')),
    ).toEqual([beta, alpha])
    expect(
      [beta, alpha].sort((left, right) => compareSearchSortValues(left, right, 'name', '')),
    ).toEqual([alpha, beta])
  })

  it('returns a bounded five-page navigation window', () => {
    expect(paginationPages(1, 9)).toEqual([1, 2, 3, 4, 5])
    expect(paginationPages(5, 9)).toEqual([3, 4, 5, 6, 7])
    expect(paginationPages(9, 9)).toEqual([5, 6, 7, 8, 9])
  })
})

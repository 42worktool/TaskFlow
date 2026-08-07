export type SearchCategory = 'all' | 'workspace' | 'card' | 'user'
export type SearchSort = 'relevance' | 'newest' | 'name'

export interface AdvancedSearchCriteria {
  text: string
  category: SearchCategory
  workspace: string | null
  label: string | null
  sort: SearchSort
  page: number
}

type RouteQueryValue = string | null | Array<string | null> | undefined

const SCOPED_COMMAND = /(^|\s)\/(type|workspace|in|label|sort):(?:"([^"]*)"|([^\s]+))/gi
const CATEGORY_COMMAND = /(^|\s)\/(all|card|cards|workspace|workspaces|user|users)(?=\s|$)/gi

function routeString(value: RouteQueryValue): string {
  const selected = Array.isArray(value) ? value.find((item) => typeof item === 'string') : value
  return typeof selected === 'string' ? selected.trim() : ''
}

function searchCategory(value: string): SearchCategory | null {
  switch (value.toLowerCase()) {
    case 'all':
      return 'all'
    case 'card':
    case 'cards':
      return 'card'
    case 'workspace':
    case 'workspaces':
      return 'workspace'
    case 'user':
    case 'users':
      return 'user'
    default:
      return null
  }
}

function searchSort(value: string): SearchSort | null {
  switch (value.toLowerCase()) {
    case 'relevance':
    case 'relevant':
      return 'relevance'
    case 'newest':
    case 'recent':
      return 'newest'
    case 'name':
    case 'alphabetical':
      return 'name'
    default:
      return null
  }
}

function routePage(value: RouteQueryValue): number {
  const parsed = Number(routeString(value))
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1
}

function categorySupportsLabels(category: SearchCategory): boolean {
  return category === 'all' || category === 'card'
}

export function parseSearchExpression(
  expression: string,
  defaultWorkspace: string | null = null,
): AdvancedSearchCriteria {
  const userShortcut = expression.trim().match(/^@(.+)$/)
  const normalizedExpression = userShortcut ? `/user ${userShortcut[1]}` : expression
  let category: SearchCategory = 'all'
  let workspace: string | null = defaultWorkspace
  let label: string | null = null
  let sort: SearchSort = 'relevance'

  let remaining = normalizedExpression.replace(
    SCOPED_COMMAND,
    (match, leading: string, command: string, quoted: string, plain: string) => {
      const value = String(quoted ?? plain ?? '').trim()
      const normalizedCommand = command.toLowerCase()

      if (normalizedCommand === 'type') {
        const parsedCategory = searchCategory(value)
        if (!parsedCategory) return match
        category = parsedCategory
      } else if (normalizedCommand === 'workspace' || normalizedCommand === 'in') {
        if (!value) return match
        workspace = value
      } else if (normalizedCommand === 'label') {
        if (!value) return match
        label = value
      } else if (normalizedCommand === 'sort') {
        const parsedSort = searchSort(value)
        if (!parsedSort) return match
        sort = parsedSort
      }

      return leading
    },
  )

  remaining = remaining.replace(CATEGORY_COMMAND, (_match, leading: string, command: string) => {
    category = searchCategory(command) ?? category
    return leading
  })

  // An unrecognised slash token remains useful as a quick keyword search:
  // `/oauth` searches for "oauth" while known slash commands configure filters.
  remaining = remaining.replace(/(^|\s)\/([^\s/]+)/g, '$1$2')

  return {
    text: remaining.replace(/\s+/g, ' ').trim(),
    category,
    workspace,
    label: workspace && categorySupportsLabels(category) ? label : null,
    sort,
    page: 1,
  }
}

export function criteriaFromRouteQuery(query: {
  q?: RouteQueryValue
  type?: RouteQueryValue
  workspace?: RouteQueryValue
  label?: RouteQueryValue
  sort?: RouteQueryValue
  page?: RouteQueryValue
}): AdvancedSearchCriteria {
  const workspace = routeString(query.workspace) || null
  const category = searchCategory(routeString(query.type)) ?? 'all'

  return {
    text: routeString(query.q),
    category,
    workspace,
    label: workspace && categorySupportsLabels(category) ? routeString(query.label) || null : null,
    sort: searchSort(routeString(query.sort)) ?? 'relevance',
    page: routePage(query.page),
  }
}

export function criteriaToRouteQuery(criteria: AdvancedSearchCriteria): Record<string, string> {
  return {
    ...(criteria.text ? { q: criteria.text } : {}),
    ...(criteria.category !== 'all' ? { type: criteria.category } : {}),
    ...(criteria.workspace ? { workspace: criteria.workspace } : {}),
    ...(criteria.workspace && criteria.label && categorySupportsLabels(criteria.category)
      ? { label: criteria.label }
      : {}),
    ...(criteria.sort !== 'relevance' ? { sort: criteria.sort } : {}),
    ...(criteria.page > 1 ? { page: String(criteria.page) } : {}),
  }
}

export function paginationPages(currentPage: number, totalPages: number): number[] {
  if (totalPages <= 0) return []
  const safeCurrent = Math.min(Math.max(1, currentPage), totalPages)
  const start = Math.max(1, Math.min(safeCurrent - 2, totalPages - 4))
  const end = Math.min(totalPages, start + 4)
  return Array.from({ length: end - start + 1 }, (_, index) => start + index)
}

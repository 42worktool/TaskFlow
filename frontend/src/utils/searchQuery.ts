export type SearchCategory = 'all' | 'workspace' | 'card'

export interface AdvancedSearchCriteria {
  text: string
  category: SearchCategory
  workspace: string | null
  label: string | null
}

type RouteQueryValue = string | null | Array<string | null> | undefined

const SCOPED_COMMAND = /(^|\s)\/(type|workspace|in|label):(?:"([^"]*)"|([^\s]+))/gi
const CATEGORY_COMMAND = /(^|\s)\/(all|card|cards|workspace|workspaces)(?=\s|$)/gi

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
    default:
      return null
  }
}

export function parseSearchExpression(
  expression: string,
  defaultWorkspace: string | null = null,
): AdvancedSearchCriteria {
  let category: SearchCategory = 'all'
  let workspace: string | null = defaultWorkspace
  let label: string | null = null

  let remaining = expression.replace(
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
    label: workspace ? label : null,
  }
}

export function criteriaFromRouteQuery(query: {
  q?: RouteQueryValue
  type?: RouteQueryValue
  workspace?: RouteQueryValue
  label?: RouteQueryValue
}): AdvancedSearchCriteria {
  const workspace = routeString(query.workspace) || null

  return {
    text: routeString(query.q),
    category: searchCategory(routeString(query.type)) ?? 'all',
    workspace,
    label: workspace ? routeString(query.label) || null : null,
  }
}

export function criteriaToRouteQuery(criteria: AdvancedSearchCriteria): Record<string, string> {
  return {
    ...(criteria.text ? { q: criteria.text } : {}),
    ...(criteria.category !== 'all' ? { type: criteria.category } : {}),
    ...(criteria.workspace ? { workspace: criteria.workspace } : {}),
    ...(criteria.workspace && criteria.label ? { label: criteria.label } : {}),
  }
}

export function matchesSearchText(
  values: Array<string | null | undefined>,
  query: string,
): boolean {
  const terms = query.toLocaleLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return true

  const searchable = values
    .filter((value): value is string => Boolean(value))
    .join(' ')
    .toLocaleLowerCase()
  return terms.every((term) => searchable.includes(term))
}

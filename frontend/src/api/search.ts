// 통합 검색 조건을 백엔드 쿼리 문자열로 변환하고 결과 종류를 판별하는 API 경계다.
import { apiRequest } from '../services/auth'
import type { PublicProfile } from './profile'

type SearchResultType = 'all' | 'workspace' | 'card' | 'user'
type SearchResultSort = 'relevance' | 'newest' | 'name'

interface SearchWorkspaceResult {
  kind: 'workspace'
  id: string
  name: string
  is_public: boolean
  member_count: number
  created_at: string
  updated_at: string
}

interface SearchCardResult {
  kind: 'card'
  id: string
  title: string
  description: string
  created_at: string
  updated_at: string
  list: { id: string; name: string }
  workspace: { id: string; name: string }
  labels: Array<{ label_id: string; label_name: string; label_color: string }>
}

interface SearchUserResult extends PublicProfile {
  kind: 'user'
}

export type SearchResult = SearchWorkspaceResult | SearchCardResult | SearchUserResult

export interface SearchResponse {
  items: SearchResult[]
  page: number
  limit: number
  total: number
  total_pages: number
}

interface SearchRequest {
  query?: string
  type?: SearchResultType
  workspaceId?: string
  labelId?: string
  sort?: SearchResultSort
  page?: number
  limit?: number
}

function searchPath(input: SearchRequest): string {
  // 기본값은 URL에서 생략해 주소를 짧게 유지하고 서버의 기본 정책과 중복하지 않는다.
  const params = new URLSearchParams()
  if (input.query) params.set('q', input.query)
  if (input.type && input.type !== 'all') params.set('type', input.type)
  if (input.workspaceId) params.set('workspace_id', input.workspaceId)
  if (input.labelId) params.set('label_id', input.labelId)
  if (input.sort && input.sort !== 'relevance') params.set('sort', input.sort)
  if (input.page && input.page > 1) params.set('page', String(input.page))
  if (input.limit) params.set('limit', String(input.limit))
  const query = params.toString()
  return query ? `/api/search?${query}` : '/api/search'
}

export const SearchAPI = {
  search: (input: SearchRequest) => apiRequest<SearchResponse>(searchPath(input)),

  users: async (query: string, workspaceId?: string, limit = 20): Promise<PublicProfile[]> => {
    const response = await apiRequest<SearchResponse>(
      searchPath({ query, type: 'user', workspaceId, limit }),
    )
    // 공용 검색 응답은 합집합 타입이므로 친구 검색 소비자에는 사용자 결과만 넘긴다.
    return response.items.flatMap((item) => (item.kind === 'user' ? [item] : []))
  },
}

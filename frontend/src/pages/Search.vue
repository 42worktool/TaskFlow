<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import AppHeader from '../components/AppHeader.vue'
import ProfileLink from '../components/ProfileLink.vue'
import { LabelAPI } from '../api/label'
import { ListAPI } from '../api/list'
import { ProfileAPI, type PublicProfile } from '../api/profile'
import { WorkspaceAPI } from '../api/workspace'
import { workspaceColor } from '../types'
import type { Label, ListWithCards, Workspace } from '../types'
import {
  compareSearchSortValues,
  criteriaFromRouteQuery,
  criteriaToRouteQuery,
  matchesSearchText,
  paginationPages,
  type AdvancedSearchCriteria,
  type SearchCategory,
  type SearchSort,
  type SearchSortValue,
} from '../utils/searchQuery'

const PAGE_SIZE = 10

const route = useRoute()
const router = useRouter()
const allWorkspaces = ref<Workspace[]>([])
const lists = ref<ListWithCards[]>([])
const workspaceLabels = ref<Label[]>([])
const searchedUsers = ref<PublicProfile[]>([])
const loading = ref(true)
const labelsLoading = ref(false)
const usersLoading = ref(false)
const loadError = ref('')
const labelLoadError = ref('')
const userLoadError = ref('')
let labelRequestVersion = 0
let userRequestVersion = 0

const criteria = computed(() =>
  criteriaFromRouteQuery({
    q: route.query.q,
    type: route.query.type,
    workspace: route.query.workspace,
    label: route.query.label,
    sort: route.query.sort,
    page: route.query.page,
  }),
)
const query = computed(() => criteria.value.text)
const hasSearchIntent = computed(
  () =>
    Boolean(criteria.value.text || criteria.value.workspace || criteria.value.label) ||
    criteria.value.category !== 'all',
)

function matchesScope(scope: string | null, id: string, name: string): boolean {
  if (!scope) return true
  const normalized = scope.toLocaleLowerCase()
  return id === scope || name.toLocaleLowerCase().includes(normalized)
}

function resolveWorkspace(scope: string | null): Workspace | null {
  if (!scope) return null
  const normalized = scope.toLocaleLowerCase()
  const exact = allWorkspaces.value.find(
    (workspace) => workspace.id === scope || workspace.name.toLocaleLowerCase() === normalized,
  )
  if (exact) return exact

  const partialMatches = allWorkspaces.value.filter((workspace) =>
    workspace.name.toLocaleLowerCase().includes(normalized),
  )
  return partialMatches.length === 1 ? partialMatches[0] : null
}

function resolveLabel(scope: string | null): Label | null {
  if (!scope) return null
  const normalized = scope.toLocaleLowerCase()
  const exact = workspaceLabels.value.find(
    (label) => label.id === scope || label.label_name.toLocaleLowerCase() === normalized,
  )
  if (exact) return exact

  const partialMatches = workspaceLabels.value.filter((label) =>
    label.label_name.toLocaleLowerCase().includes(normalized),
  )
  return partialMatches.length === 1 ? partialMatches[0] : null
}

const selectedWorkspace = computed(() => resolveWorkspace(criteria.value.workspace))
const selectedLabel = computed(() =>
  selectedWorkspace.value ? resolveLabel(criteria.value.label) : null,
)
const hasLabelScope = computed(() => Boolean(selectedWorkspace.value && criteria.value.label))
const labelFilterUnavailable = computed(
  () => criteria.value.category === 'workspace' || criteria.value.category === 'user',
)

const workspaceResults = computed(() => {
  if (
    criteria.value.category === 'card' ||
    criteria.value.category === 'user' ||
    hasLabelScope.value
  )
    return []
  return allWorkspaces.value.filter(
    (workspace) =>
      matchesScope(criteria.value.workspace, workspace.id, workspace.name) &&
      matchesSearchText(
        [workspace.name, ...workspace.members.map((member) => member.user.name)],
        criteria.value.text,
      ),
  )
})

const cardResults = computed(() => {
  if (criteria.value.category === 'workspace' || criteria.value.category === 'user') return []

  return lists.value.flatMap((list) => {
    const workspace = allWorkspaces.value.find((item) => item.id === list.workspace_id)
    if (!workspace) return []

    const workspaceMatches = selectedWorkspace.value
      ? workspace.id === selectedWorkspace.value.id
      : matchesScope(criteria.value.workspace, workspace.id, workspace.name)
    if (!workspaceMatches) return []

    return list.cards
      .filter((card) => {
        const labels = card.labels ?? []
        const labelMatches = hasLabelScope.value
          ? Boolean(
              selectedLabel.value &&
              labels.some((label) => label.label_id === selectedLabel.value?.id),
            )
          : true
        if (!labelMatches) return false

        return matchesSearchText(
          [
            card.title,
            card.description,
            list.name,
            workspace.name,
            ...labels.map((label) => label.label_name),
          ],
          criteria.value.text,
        )
      })
      .map((card) => ({ card, list, workspace }))
  })
})

const userResults = computed(() => {
  if (
    criteria.value.category === 'workspace' ||
    criteria.value.category === 'card' ||
    hasLabelScope.value
  )
    return []
  if (criteria.value.workspace && !selectedWorkspace.value) return []
  if (!selectedWorkspace.value) return searchedUsers.value

  const memberIds = new Set(selectedWorkspace.value.members.map((member) => member.user_id))
  return searchedUsers.value.filter((user) => memberIds.has(user.id))
})

type SearchResultItem =
  | {
      kind: 'workspace'
      key: string
      workspace: Workspace
      sortValue: SearchSortValue
    }
  | {
      kind: 'card'
      key: string
      result: (typeof cardResults.value)[number]
      sortValue: SearchSortValue
    }
  | {
      kind: 'user'
      key: string
      user: PublicProfile
      sortValue: SearchSortValue
    }

const sortedResults = computed<SearchResultItem[]>(() => {
  const results: SearchResultItem[] = [
    ...workspaceResults.value.map((workspace): SearchResultItem => ({
      kind: 'workspace',
      key: `workspace:${workspace.id}`,
      workspace,
      sortValue: {
        name: workspace.name,
        createdAt: workspace.updated_at,
        searchable: [workspace.name, ...workspace.members.map((member) => member.user.name)],
      },
    })),
    ...cardResults.value.map((result): SearchResultItem => ({
      kind: 'card',
      key: `card:${result.card.id}`,
      result,
      sortValue: {
        name: result.card.title,
        createdAt: result.card.created_at,
        searchable: [
          result.card.title,
          result.card.description,
          result.list.name,
          result.workspace.name,
          ...(result.card.labels ?? []).map((label) => label.label_name),
        ],
      },
    })),
    ...userResults.value.map((user): SearchResultItem => ({
      kind: 'user',
      key: `user:${user.id}`,
      user,
      sortValue: {
        name: user.name,
        createdAt: user.created_at,
        searchable: [user.name, user.headline],
      },
    })),
  ]

  return results.sort(
    (left, right) =>
      compareSearchSortValues(
        left.sortValue,
        right.sortValue,
        criteria.value.sort,
        criteria.value.text,
      ) || left.key.localeCompare(right.key),
  )
})

const totalResults = computed(() => sortedResults.value.length)
const pageCount = computed(() => Math.max(1, Math.ceil(totalResults.value / PAGE_SIZE)))
const currentPage = computed(() => Math.min(criteria.value.page, pageCount.value))
const pageNumbers = computed(() => paginationPages(currentPage.value, pageCount.value))
const pagedResults = computed(() => {
  const start = (currentPage.value - 1) * PAGE_SIZE
  return sortedResults.value.slice(start, start + PAGE_SIZE)
})
const pagedWorkspaceResults = computed(() =>
  pagedResults.value.flatMap((item) => (item.kind === 'workspace' ? [item.workspace] : [])),
)
const pagedCardResults = computed(() =>
  pagedResults.value.flatMap((item) => (item.kind === 'card' ? [item.result] : [])),
)
const pagedUserResults = computed(() =>
  pagedResults.value.flatMap((item) => (item.kind === 'user' ? [item.user] : [])),
)
const firstResultNumber = computed(() =>
  totalResults.value === 0 ? 0 : (currentPage.value - 1) * PAGE_SIZE + 1,
)
const lastResultNumber = computed(() => Math.min(currentPage.value * PAGE_SIZE, totalResults.value))
const hasResults = computed(() => totalResults.value > 0)
const workspaceSelectValue = computed(() => selectedWorkspace.value?.id ?? '')
const labelSelectValue = computed(() => selectedLabel.value?.id ?? '')
const workspaceScopeLabel = computed(
  () => selectedWorkspace.value?.name ?? criteria.value.workspace,
)
const labelScopeLabel = computed(() => selectedLabel.value?.label_name ?? criteria.value.label)

function userWorkspaceSummary(userId: string): string {
  if (selectedWorkspace.value) return `${selectedWorkspace.value.name} 구성원`

  const workspaceNames = allWorkspaces.value
    .filter((workspace) => workspace.members.some((member) => member.user_id === userId))
    .map((workspace) => workspace.name)
  if (workspaceNames.length === 0) return '공개 프로필'
  if (workspaceNames.length === 1) return workspaceNames[0]
  return `${workspaceNames[0]} 외 ${workspaceNames.length - 1}개 워크스페이스`
}

function updateCriteria(patch: Partial<AdvancedSearchCriteria>) {
  const next = {
    ...criteria.value,
    ...patch,
    page: patch.page ?? 1,
  }
  void router.replace({ path: '/search', query: criteriaToRouteQuery(next) })
}

function setCategory(category: SearchCategory) {
  updateCriteria({
    category,
    ...(category === 'workspace' || category === 'user' ? { label: null } : {}),
  })
}

function selectWorkspace(event: Event) {
  const workspace = (event.target as HTMLSelectElement).value || null
  updateCriteria({ workspace, label: null })
}

function selectLabel(event: Event) {
  const label = (event.target as HTMLSelectElement).value || null
  updateCriteria({
    label,
    ...(label && (criteria.value.category === 'workspace' || criteria.value.category === 'user')
      ? { category: 'card' as const }
      : {}),
  })
}

function selectSort(event: Event) {
  updateCriteria({ sort: (event.target as HTMLSelectElement).value as SearchSort })
}

function setPage(page: number) {
  const nextPage = Math.min(Math.max(1, page), pageCount.value)
  if (nextPage === currentPage.value) return
  updateCriteria({ page: nextPage })
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function clearFilters() {
  updateCriteria({ category: 'all', workspace: null, label: null })
}

async function loadSearchData() {
  loading.value = true
  loadError.value = ''
  try {
    const workspaces = await WorkspaceAPI.list()
    allWorkspaces.value = [...workspaces.my, ...workspaces.public]
    const workspaceLists = await Promise.all(
      allWorkspaces.value.map((workspace) => ListAPI.listByWorkspace(workspace.id)),
    )
    lists.value = workspaceLists.flat()
  } catch (caught) {
    loadError.value =
      caught instanceof Error ? caught.message : '검색 데이터를 불러오지 못했습니다.'
  } finally {
    loading.value = false
  }
}

watch(
  () => selectedWorkspace.value?.id ?? null,
  async (workspaceId) => {
    const requestVersion = ++labelRequestVersion
    workspaceLabels.value = []
    labelLoadError.value = ''
    if (!workspaceId) {
      labelsLoading.value = false
      return
    }

    labelsLoading.value = true
    try {
      const labels = await LabelAPI.list(workspaceId)
      if (requestVersion !== labelRequestVersion) return
      workspaceLabels.value = [...labels].sort((left, right) =>
        left.label_name.localeCompare(right.label_name, 'ko'),
      )
    } catch (caught) {
      if (requestVersion !== labelRequestVersion) return
      labelLoadError.value =
        caught instanceof Error ? caught.message : '레이블을 불러오지 못했습니다.'
    } finally {
      if (requestVersion === labelRequestVersion) labelsLoading.value = false
    }
  },
  { immediate: true },
)

watch([loading, () => criteria.value.label, selectedWorkspace], ([isLoading, label, workspace]) => {
  if (!isLoading && label && !workspace) updateCriteria({ label: null })
})

watch(
  [
    query,
    () => criteria.value.category,
    hasLabelScope,
    () => selectedWorkspace.value?.id ?? null,
    () => criteria.value.workspace,
  ],
  async ([text, category, labelScoped, workspaceId, workspaceScope]) => {
    const requestVersion = ++userRequestVersion
    searchedUsers.value = []
    userLoadError.value = ''
    if (
      !text ||
      (category !== 'all' && category !== 'user') ||
      labelScoped ||
      (workspaceScope && !workspaceId)
    ) {
      usersLoading.value = false
      return
    }

    usersLoading.value = true
    try {
      const users = await ProfileAPI.search(text, workspaceId ?? undefined)
      if (requestVersion !== userRequestVersion) return
      searchedUsers.value = users
    } catch (caught) {
      if (requestVersion !== userRequestVersion) return
      userLoadError.value =
        caught instanceof Error ? caught.message : '사용자를 검색하지 못했습니다.'
    } finally {
      if (requestVersion === userRequestVersion) usersLoading.value = false
    }
  },
  { immediate: true },
)

watch(
  [loading, usersLoading, pageCount, () => criteria.value.page],
  ([searchLoading, peopleLoading, availablePages, requestedPage]) => {
    if (!searchLoading && !peopleLoading && requestedPage > availablePages) {
      updateCriteria({ page: availablePages })
    }
  },
)

onMounted(() => {
  void loadSearchData()
})
</script>

<template>
  <div class="search-shell">
    <AppHeader :initial-query="query" />

    <main class="search-page">
      <div class="search-heading">
        <div>
          <h1 class="search-title">검색</h1>
          <p v-if="hasSearchIntent" class="search-summary">
            <template v-if="query">“{{ query }}” · </template>{{ totalResults }}개 결과
          </p>
          <p v-else class="search-summary">검색어 또는 필터를 사용해 항목을 찾아보세요.</p>
        </div>

        <details class="search-help">
          <summary>/ 명령어</summary>
          <div class="search-help-popover">
            <code>/keyword</code><span>keyword를 바로 검색</span> <code>/card</code
            ><span>카드만 표시</span> <code>/user</code><span>사용자만 표시</span>
            <code>/workspace</code><span>워크스페이스만 표시</span> <code>/workspace:"이름"</code
            ><span>워크스페이스 범위 지정</span> <code>/label:이름</code
            ><span>선택한 워크스페이스 안의 카드만 표시</span> <code>/sort:newest</code
            ><span>관련도순 대신 최신순으로 정렬</span>
          </div>
        </details>
      </div>

      <section class="search-filter-panel" aria-label="검색 필터">
        <div class="search-filter-group search-filter-group--category">
          <span class="search-filter-label">카테고리</span>
          <div class="search-category-options">
            <button
              v-for="option in [
                { value: 'all', label: '전체' },
                { value: 'workspace', label: '워크스페이스' },
                { value: 'card', label: '카드' },
                { value: 'user', label: '사용자' },
              ]"
              :key="option.value"
              type="button"
              class="search-category-button"
              :class="{ 'search-category-button--active': criteria.category === option.value }"
              :aria-pressed="criteria.category === option.value"
              @click="setCategory(option.value as SearchCategory)"
            >
              {{ option.label }}
            </button>
          </div>
        </div>

        <label class="search-filter-group">
          <span class="search-filter-label">워크스페이스</span>
          <select :value="workspaceSelectValue" :disabled="loading" @change="selectWorkspace">
            <option value="">모든 워크스페이스</option>
            <option v-for="workspace in allWorkspaces" :key="workspace.id" :value="workspace.id">
              {{ workspace.name }}
            </option>
          </select>
        </label>

        <label class="search-filter-group">
          <span class="search-filter-label">레이블</span>
          <select
            :value="labelSelectValue"
            :disabled="loading || labelsLoading || !selectedWorkspace || labelFilterUnavailable"
            @change="selectLabel"
          >
            <option value="">
              {{
                labelFilterUnavailable
                  ? '현재 카테고리에서는 사용하지 않음'
                  : !selectedWorkspace
                    ? '워크스페이스를 먼저 선택하세요'
                    : labelsLoading
                      ? '레이블을 불러오는 중…'
                      : '모든 레이블'
              }}
            </option>
            <option v-for="label in workspaceLabels" :key="label.id" :value="label.id">
              {{ label.label_name }}
            </option>
          </select>
          <small v-if="labelFilterUnavailable" class="search-filter-hint">
            레이블 필터는 전체 또는 카드 검색에서 사용합니다.
          </small>
          <small v-else-if="!selectedWorkspace" class="search-filter-hint">
            레이블은 하나의 워크스페이스 안에서만 검색할 수 있습니다.
          </small>
          <small v-else-if="labelLoadError" class="search-filter-hint search-filter-hint--error">
            {{ labelLoadError }}
          </small>
        </label>

        <label class="search-filter-group">
          <span class="search-filter-label">정렬</span>
          <select :value="criteria.sort" @change="selectSort">
            <option value="relevance">관련도순</option>
            <option value="newest">최신순</option>
            <option value="name">이름순</option>
          </select>
          <small class="search-filter-hint">모든 결과 유형에 같은 정렬 기준을 적용합니다.</small>
        </label>
      </section>

      <div
        v-if="criteria.category !== 'all' || criteria.workspace || criteria.label"
        class="search-active-filters"
        aria-label="적용된 필터"
      >
        <button
          v-if="criteria.category !== 'all'"
          type="button"
          class="search-filter-chip"
          @click="updateCriteria({ category: 'all' })"
        >
          {{
            criteria.category === 'card'
              ? '카드'
              : criteria.category === 'user'
                ? '사용자'
                : '워크스페이스'
          }}
          ×
        </button>
        <button
          v-if="criteria.workspace"
          type="button"
          class="search-filter-chip"
          @click="updateCriteria({ workspace: null, label: null })"
        >
          워크스페이스: {{ workspaceScopeLabel }} ×
        </button>
        <button
          v-if="hasLabelScope"
          type="button"
          class="search-filter-chip"
          @click="updateCriteria({ label: null })"
        >
          레이블: {{ labelScopeLabel }} ×
        </button>
        <button type="button" class="search-filter-clear" @click="clearFilters">필터 초기화</button>
      </div>

      <div v-if="loadError" class="empty-state" role="alert">{{ loadError }}</div>
      <div v-else-if="loading || usersLoading" class="empty-state" role="status">
        검색 데이터를 불러오는 중…
      </div>
      <div v-else-if="userLoadError && !hasResults" class="empty-state" role="alert">
        {{ userLoadError }}
      </div>
      <div v-else-if="!hasSearchIntent" class="empty-state">
        상단 검색창에 키워드를 입력하거나 카테고리·범위 필터를 선택하세요.
      </div>
      <div v-else-if="!hasResults" class="empty-state">
        {{
          criteria.category === 'user' && !query
            ? '검색할 사용자 이름이나 한 줄 소개를 입력하세요.'
            : '조건에 맞는 검색 결과가 없습니다.'
        }}
      </div>

      <template v-else>
        <section v-if="pagedWorkspaceResults.length" class="result-section">
          <div class="section-header">
            <h2 class="section-title">워크스페이스</h2>
            <span class="result-count">{{ workspaceResults.length }}</span>
          </div>
          <div class="result-list">
            <RouterLink
              v-for="workspace in pagedWorkspaceResults"
              :key="workspace.id"
              :to="`/workspaces/${workspace.id}/board`"
              class="result-row"
            >
              <span class="result-color" :style="{ background: workspaceColor(workspace.id) }" />
              <div class="result-content">
                <p class="result-title">{{ workspace.name }}</p>
                <p class="result-meta">
                  {{ workspace.is_public ? '공개 워크스페이스' : '비공개 워크스페이스' }} · 멤버
                  {{ workspace.members.length }}명
                </p>
              </div>
              <span class="result-arrow">→</span>
            </RouterLink>
          </div>
        </section>

        <section v-if="pagedCardResults.length" class="result-section">
          <div class="section-header">
            <h2 class="section-title">카드</h2>
            <span class="result-count">{{ cardResults.length }}</span>
          </div>
          <div class="result-list">
            <RouterLink
              v-for="result in pagedCardResults"
              :key="result.card.id"
              :to="{
                path: `/workspaces/${result.workspace.id}/board`,
                query: { card: result.card.id },
              }"
              class="result-row"
            >
              <span class="card-marker" />
              <div class="result-content">
                <p class="result-title">{{ result.card.title }}</p>
                <p class="result-meta">
                  {{ result.workspace.name }} · {{ result.list?.name ?? '목록 없음' }}
                </p>
                <span v-if="result.card.description" class="result-description">
                  {{ result.card.description }}
                </span>
                <span v-if="result.card.labels?.length" class="result-labels">
                  <span
                    v-for="label in result.card.labels"
                    :key="label.label_id"
                    class="result-label"
                  >
                    <i :style="{ background: label.label_color }" />{{ label.label_name }}
                  </span>
                </span>
              </div>
              <span class="result-arrow">→</span>
            </RouterLink>
          </div>
        </section>

        <section v-if="pagedUserResults.length" class="result-section">
          <div class="section-header">
            <h2 class="section-title">사람</h2>
            <span class="result-count">{{ userResults.length }}</span>
          </div>
          <div v-if="userLoadError" class="section-empty" role="alert">{{ userLoadError }}</div>
          <div v-else class="result-list result-list--people">
            <ProfileLink
              v-for="user in pagedUserResults"
              :key="user.id"
              :user-id="user.id"
              class="result-row result-person-row"
            >
              <img
                v-if="user.profile_image_url"
                :src="user.profile_image_url"
                :alt="`${user.name} 프로필 사진`"
                class="result-user-avatar"
              />
              <span v-else class="result-user-avatar result-user-avatar--fallback">
                {{ user.name.trim().charAt(0).toUpperCase() || '?' }}
              </span>
              <div class="result-content">
                <div class="result-person-name-line">
                  <p class="result-title">{{ user.name }}</p>
                  <span>사람</span>
                </div>
                <p class="result-person-headline">{{ user.headline }}</p>
                <p class="result-person-context">{{ userWorkspaceSummary(user.id) }}</p>
              </div>
              <span class="result-person-action">프로필 보기</span>
            </ProfileLink>
          </div>
        </section>

        <nav v-if="pageCount > 1" class="search-pagination" aria-label="검색 결과 페이지">
          <p class="search-pagination__summary">
            {{ firstResultNumber }}–{{ lastResultNumber }} / {{ totalResults }}
          </p>
          <div class="search-pagination__buttons">
            <button
              type="button"
              class="search-pagination__step"
              :disabled="currentPage === 1"
              aria-label="이전 페이지"
              @click="setPage(currentPage - 1)"
            >
              이전
            </button>
            <button
              v-for="page in pageNumbers"
              :key="page"
              type="button"
              class="search-pagination__page"
              :class="{ 'search-pagination__page--active': page === currentPage }"
              :aria-current="page === currentPage ? 'page' : undefined"
              :aria-label="`${page}페이지`"
              @click="setPage(page)"
            >
              {{ page }}
            </button>
            <button
              type="button"
              class="search-pagination__step"
              :disabled="currentPage === pageCount"
              aria-label="다음 페이지"
              @click="setPage(currentPage + 1)"
            >
              다음
            </button>
          </div>
        </nav>
      </template>
    </main>
  </div>
</template>

<style scoped src="../styles/search.css"></style>

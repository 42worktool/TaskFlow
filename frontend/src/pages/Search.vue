<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import AppHeader from '../components/AppHeader.vue'
import { LabelAPI } from '../api/label'
import { SearchAPI, type SearchResult } from '../api/search'
import { WorkspaceAPI } from '../api/workspace'
import { workspaceColor } from '../types'
import type { Label, Workspace } from '../types'
import {
  criteriaFromRouteQuery,
  criteriaToRouteQuery,
  paginationPages,
  type AdvancedSearchCriteria,
  type SearchCategory,
  type SearchSort,
} from '../utils/searchQuery'

const PAGE_SIZE = 10

const route = useRoute()
const router = useRouter()
const allWorkspaces = ref<Workspace[]>([])
const workspaceLabels = ref<Label[]>([])
const searchResults = ref<SearchResult[]>([])
const totalResults = ref(0)
const totalPages = ref(1)
const loading = ref(true)
const labelsLoading = ref(false)
const searchLoading = ref(false)
const loadError = ref('')
const labelLoadError = ref('')
const searchError = ref('')
let labelRequestVersion = 0
let searchRequestVersion = 0

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

const workspaceResults = computed(() =>
  searchResults.value.flatMap((item) => (item.kind === 'workspace' ? [item] : [])),
)
const cardResults = computed(() =>
  searchResults.value.flatMap((item) =>
    item.kind === 'card'
      ? [
          {
            card: item,
            list: item.list,
            workspace: item.workspace,
          },
        ]
      : [],
  ),
)
const userResults = computed(() =>
  searchResults.value.flatMap((item) => (item.kind === 'user' ? [item] : [])),
)

const pageCount = computed(() => totalPages.value)
const currentPage = computed(() => Math.min(criteria.value.page, pageCount.value))
const pageNumbers = computed(() => paginationPages(currentPage.value, pageCount.value))
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
    loading,
    labelsLoading,
    hasSearchIntent,
    query,
    () => criteria.value.category,
    () => criteria.value.sort,
    () => criteria.value.page,
    () => selectedWorkspace.value?.id ?? null,
    () => selectedLabel.value?.id ?? null,
    () => criteria.value.workspace,
    () => criteria.value.label,
  ],
  async ([
    metadataLoading,
    currentLabelsLoading,
    searchIntent,
    text,
    category,
    sort,
    page,
    workspaceId,
    labelId,
    workspaceScope,
    labelScope,
  ]) => {
    const requestVersion = ++searchRequestVersion
    searchResults.value = []
    totalResults.value = 0
    totalPages.value = 1
    searchError.value = ''
    if (
      metadataLoading ||
      !searchIntent ||
      (workspaceScope && !workspaceId) ||
      (labelScope && (currentLabelsLoading || !labelId))
    ) {
      searchLoading.value = false
      return
    }

    searchLoading.value = true
    try {
      const response = await SearchAPI.search({
        query: text,
        type: category,
        workspaceId: workspaceId ?? undefined,
        labelId: labelId ?? undefined,
        sort,
        page,
        limit: PAGE_SIZE,
      })
      if (requestVersion !== searchRequestVersion) return
      searchResults.value = response.items
      totalResults.value = response.total
      totalPages.value = response.total_pages
    } catch (caught) {
      if (requestVersion !== searchRequestVersion) return
      searchError.value = caught instanceof Error ? caught.message : '검색하지 못했습니다.'
    } finally {
      if (requestVersion === searchRequestVersion) searchLoading.value = false
    }
  },
  { immediate: true },
)

watch(
  [loading, searchLoading, pageCount, () => criteria.value.page],
  ([metadataLoading, resultsLoading, availablePages, requestedPage]) => {
    if (!metadataLoading && !resultsLoading && requestedPage > availablePages) {
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
      <div v-else-if="loading || searchLoading" class="empty-state" role="status">
        검색 데이터를 불러오는 중…
      </div>
      <div v-else-if="searchError && !hasResults" class="empty-state" role="alert">
        {{ searchError }}
      </div>
      <div v-else-if="!hasSearchIntent" class="empty-state">
        상단 검색창에 키워드를 입력하거나 카테고리·범위 필터를 선택하세요.
      </div>
      <div v-else-if="!hasResults" class="empty-state">
        {{
          criteria.category === 'user' && !query
            ? '검색할 사용자 이름 또는 이메일을 입력하세요.'
            : '조건에 맞는 검색 결과가 없습니다.'
        }}
      </div>

      <template v-else>
        <section v-if="workspaceResults.length" class="result-section">
          <div class="section-header">
            <h2 class="section-title">워크스페이스</h2>
          </div>
          <div class="result-list">
            <RouterLink
              v-for="workspace in workspaceResults"
              :key="workspace.id"
              :to="`/workspaces/${workspace.id}/board`"
              class="result-row"
            >
              <span class="result-color" :style="{ background: workspaceColor(workspace.id) }" />
              <div class="result-content">
                <p class="result-title">{{ workspace.name }}</p>
                <p class="result-meta">
                  {{ workspace.is_public ? '공개 워크스페이스' : '비공개 워크스페이스' }} · 멤버
                  {{ workspace.member_count }}명
                </p>
              </div>
              <span class="result-arrow">→</span>
            </RouterLink>
          </div>
        </section>

        <section v-if="cardResults.length" class="result-section">
          <div class="section-header">
            <h2 class="section-title">카드</h2>
          </div>
          <div class="result-list">
            <RouterLink
              v-for="result in cardResults"
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

        <section v-if="userResults.length" class="result-section">
          <div class="section-header">
            <h2 class="section-title">사람</h2>
          </div>
          <div v-if="searchError" class="section-empty" role="alert">{{ searchError }}</div>
          <div v-else class="result-list result-list--people">
            <RouterLink
              v-for="user in userResults"
              :key="user.id"
              :to="`/profiles/${user.id}`"
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
            </RouterLink>
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

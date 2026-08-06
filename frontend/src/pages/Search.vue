<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import AppHeader from '../components/AppHeader.vue'
import { LabelAPI } from '../api/label'
import { ListAPI } from '../api/list'
import { WorkspaceAPI } from '../api/workspace'
import { workspaceColor } from '../types'
import type { Label, ListWithCards, Workspace } from '../types'
import {
  criteriaFromRouteQuery,
  criteriaToRouteQuery,
  matchesSearchText,
  type AdvancedSearchCriteria,
  type SearchCategory,
} from '../utils/searchQuery'

const route = useRoute()
const router = useRouter()
const allWorkspaces = ref<Workspace[]>([])
const lists = ref<ListWithCards[]>([])
const workspaceLabels = ref<Label[]>([])
const loading = ref(true)
const labelsLoading = ref(false)
const loadError = ref('')
const labelLoadError = ref('')
let labelRequestVersion = 0

const criteria = computed(() =>
  criteriaFromRouteQuery({
    q: route.query.q,
    type: route.query.type,
    workspace: route.query.workspace,
    label: route.query.label,
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

const workspaceResults = computed(() => {
  if (criteria.value.category === 'card' || hasLabelScope.value) return []
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
  if (criteria.value.category === 'workspace') return []

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

const totalResults = computed(() => workspaceResults.value.length + cardResults.value.length)
const hasResults = computed(() => totalResults.value > 0)
const workspaceSelectValue = computed(() => selectedWorkspace.value?.id ?? '')
const labelSelectValue = computed(() => selectedLabel.value?.id ?? '')
const workspaceScopeLabel = computed(
  () => selectedWorkspace.value?.name ?? criteria.value.workspace,
)
const labelScopeLabel = computed(() => selectedLabel.value?.label_name ?? criteria.value.label)

function updateCriteria(patch: Partial<AdvancedSearchCriteria>) {
  const next = { ...criteria.value, ...patch }
  void router.replace({ path: '/search', query: criteriaToRouteQuery(next) })
}

function setCategory(category: SearchCategory) {
  updateCriteria({ category })
}

function selectWorkspace(event: Event) {
  const workspace = (event.target as HTMLSelectElement).value || null
  updateCriteria({ workspace, label: null })
}

function selectLabel(event: Event) {
  const label = (event.target as HTMLSelectElement).value || null
  updateCriteria({
    label,
    ...(label && criteria.value.category === 'workspace' ? { category: 'card' as const } : {}),
  })
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
            ><span>카드만 표시</span> <code>/workspace</code><span>워크스페이스만 표시</span>
            <code>/workspace:"이름"</code><span>워크스페이스 범위 지정</span>
            <code>/label:이름</code><span>선택한 워크스페이스 안의 카드만 표시</span>
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
            :disabled="loading || labelsLoading || !selectedWorkspace"
            @change="selectLabel"
          >
            <option value="">
              {{
                !selectedWorkspace
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
          <small v-if="!selectedWorkspace" class="search-filter-hint">
            레이블은 하나의 워크스페이스 안에서만 검색할 수 있습니다.
          </small>
          <small v-else-if="labelLoadError" class="search-filter-hint search-filter-hint--error">
            {{ labelLoadError }}
          </small>
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
          {{ criteria.category === 'card' ? '카드' : '워크스페이스' }} ×
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
      <div v-else-if="loading" class="empty-state" role="status">검색 데이터를 불러오는 중…</div>
      <div v-else-if="!hasSearchIntent" class="empty-state">
        상단 검색창에 키워드를 입력하거나 카테고리·범위 필터를 선택하세요.
      </div>
      <div v-else-if="!hasResults" class="empty-state">조건에 맞는 검색 결과가 없습니다.</div>

      <template v-else>
        <section v-if="criteria.category !== 'card' && !hasLabelScope" class="result-section">
          <div class="section-header">
            <h2 class="section-title">워크스페이스</h2>
            <span class="result-count">{{ workspaceResults.length }}</span>
          </div>
          <div v-if="workspaceResults.length" class="result-list">
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
                  {{ workspace.members.length }}명
                </p>
              </div>
              <span class="result-arrow">→</span>
            </RouterLink>
          </div>
          <div v-else class="section-empty">일치하는 워크스페이스가 없습니다.</div>
        </section>

        <section v-if="criteria.category !== 'workspace'" class="result-section">
          <div class="section-header">
            <h2 class="section-title">카드</h2>
            <span class="result-count">{{ cardResults.length }}</span>
          </div>
          <div v-if="cardResults.length" class="result-list">
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
          <div v-else class="section-empty">일치하는 카드가 없습니다.</div>
        </section>
      </template>
    </main>
  </div>
</template>

<style scoped src="../styles/search.css"></style>

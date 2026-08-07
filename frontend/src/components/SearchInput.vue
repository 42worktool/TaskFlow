<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { PublicProfile } from '../api/profile'
import { SearchAPI } from '../api/search'
import {
  criteriaFromRouteQuery,
  criteriaToRouteQuery,
  parseSearchExpression,
} from '../utils/searchQuery'

const props = defineProps<{
  initialQuery?: string
}>()

const router = useRouter()
const route = useRoute()
const query = ref(props.initialQuery ?? '')
const input = ref<HTMLInputElement | null>(null)
const focused = ref(false)
const activeSuggestion = ref(0)
const peopleSuggestions = ref<PublicProfile[]>([])
const peopleLoading = ref(false)
const peopleError = ref('')
let peopleRequestVersion = 0
let peopleSearchTimer: ReturnType<typeof setTimeout> | null = null

const commands = [
  { command: '/card', insert: '/card ', label: '카드만', description: '카드 결과만 검색' },
  { command: '/user', insert: '/user ', label: '사람', description: '이름과 소개로 검색' },
  {
    command: '/workspace',
    insert: '/workspace ',
    label: '워크스페이스만',
    description: '워크스페이스 결과만 검색',
  },
  { command: '/all', insert: '/all ', label: '전체', description: '모든 카테고리 검색' },
  {
    command: '/workspace:',
    insert: '/workspace:',
    label: '워크스페이스 범위',
    description: '예: /workspace:"TaskFlow Product"',
  },
  {
    command: '/label:',
    insert: '/label:',
    label: '레이블 범위',
    description: '워크스페이스 선택 후 사용',
  },
  {
    command: '/sort:relevance',
    insert: '/sort:relevance ',
    label: '관련도순',
    description: '검색어와 가장 가까운 결과부터 표시',
  },
  {
    command: '/sort:newest',
    insert: '/sort:newest ',
    label: '최신순',
    description: '최근 생성·수정된 결과부터 표시',
  },
  {
    command: '/sort:name',
    insert: '/sort:name ',
    label: '이름순',
    description: '이름과 제목을 가나다순으로 표시',
  },
] as const

function routeString(value: unknown): string | null {
  const selected = Array.isArray(value) ? value[0] : value
  return typeof selected === 'string' && selected.trim() ? selected.trim() : null
}

const routeCriteria = computed(() =>
  criteriaFromRouteQuery({
    q: route.query.q,
    type: route.query.type,
    workspace: route.query.workspace,
    label: route.query.label,
    sort: route.query.sort,
    page: route.query.page,
  }),
)

const currentWorkspace = computed(
  () => routeCriteria.value.workspace ?? routeString(route.params.workspaceId),
)

const workspaceIdForLookup = computed(() => {
  const workspace = currentWorkspace.value
  return workspace &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(workspace)
    ? workspace
    : undefined
})

function searchCriteria() {
  const parsed = parseSearchExpression(query.value, currentWorkspace.value)
  const hasCategoryCommand =
    /(^|\s)\/(all|card|cards|workspace|workspaces|user|users)(?=\s|$)/i.test(query.value)
  const hasLabelCommand = /(^|\s)\/label:/i.test(query.value)
  const hasSortCommand = /(^|\s)\/sort:/i.test(query.value)
  const category =
    hasCategoryCommand || query.value.trim().startsWith('@')
      ? parsed.category
      : routeCriteria.value.category

  return {
    ...parsed,
    category,
    label:
      category === 'user' || category === 'workspace'
        ? null
        : hasLabelCommand
          ? parsed.label
          : routeCriteria.value.label,
    sort: hasSortCommand ? parsed.sort : routeCriteria.value.sort,
    page: 1,
  }
}

const hasWorkspaceContext = computed(() => Boolean(searchCriteria().workspace))

const activeSlashToken = computed(() => {
  const match = query.value.match(/(^|\s)(\/[^\s]*)$/)
  return match?.[2]?.toLocaleLowerCase() ?? null
})

const commandSuggestions = computed(() => {
  const token = activeSlashToken.value
  if (!token) return []
  return commands.filter((item) => {
    if (item.command === '/label:' && !hasWorkspaceContext.value) return false
    return item.command.startsWith(token) || item.label.toLocaleLowerCase().includes(token.slice(1))
  })
})

const explicitPeopleSearch = computed(
  () =>
    query.value.trim().startsWith('@') ||
    /(^|\s)\/(user|users)(?=\s|$)/i.test(query.value) ||
    routeCriteria.value.category === 'user',
)

const peopleLookupText = computed(() =>
  explicitPeopleSearch.value ? searchCriteria().text.trim() : '',
)

const visiblePeople = computed(() => peopleSuggestions.value.slice(0, 5))
const commandPanelOpen = computed(() => focused.value && commandSuggestions.value.length > 0)
const peoplePanelOpen = computed(
  () =>
    focused.value &&
    !activeSlashToken.value &&
    explicitPeopleSearch.value &&
    peopleLookupText.value.length > 0,
)
const suggestionsOpen = computed(() => commandPanelOpen.value || peoplePanelOpen.value)
const optionCount = computed(() =>
  commandPanelOpen.value ? commandSuggestions.value.length : visiblePeople.value.length + 1,
)
const activeDescendant = computed(() => {
  if (!suggestionsOpen.value) return undefined
  return commandPanelOpen.value
    ? `search-command-${activeSuggestion.value}`
    : `search-person-${activeSuggestion.value}`
})

watch(
  () => [props.initialQuery, route.fullPath] as const,
  ([value]) => {
    query.value = value ?? ''
  },
)

watch(
  [commandSuggestions, visiblePeople, commandPanelOpen, peoplePanelOpen],
  () => {
    activeSuggestion.value = 0
  },
  { deep: true },
)

watch(
  [peopleLookupText, workspaceIdForLookup, focused],
  ([text, workspaceId, isFocused]) => {
    const requestVersion = ++peopleRequestVersion
    if (peopleSearchTimer) clearTimeout(peopleSearchTimer)
    peopleSuggestions.value = []
    peopleError.value = ''
    peopleLoading.value = false
    if (!text || !isFocused) return

    peopleLoading.value = true
    peopleSearchTimer = setTimeout(async () => {
      try {
        const users = await SearchAPI.users(text, workspaceId, 5)
        if (requestVersion !== peopleRequestVersion) return
        peopleSuggestions.value = users
      } catch {
        if (requestVersion !== peopleRequestVersion) return
        peopleError.value = '사람을 불러오지 못했습니다.'
      } finally {
        if (requestVersion === peopleRequestVersion) peopleLoading.value = false
      }
    }, 180)
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  if (peopleSearchTimer) clearTimeout(peopleSearchTimer)
  peopleRequestVersion += 1
})

function submitSearch() {
  focused.value = false
  void router.push({ path: '/search', query: criteriaToRouteQuery(searchCriteria()) })
}

function submitPeopleSearch() {
  const criteria = searchCriteria()
  focused.value = false
  void router.push({
    path: '/search',
    query: criteriaToRouteQuery({ ...criteria, category: 'user' }),
  })
}

function selectCommand(index: number) {
  const suggestion = commandSuggestions.value[index]
  const token = activeSlashToken.value
  if (!suggestion || !token) return

  const tokenStart = query.value.length - token.length
  query.value = `${query.value.slice(0, tokenStart)}${suggestion.insert}`
  activeSuggestion.value = 0
  void nextTick(() => input.value?.focus())
}

function selectPerson(user: PublicProfile) {
  focused.value = false
  void router.push(`/profiles/${user.id}`)
}

function selectActiveSuggestion() {
  if (commandPanelOpen.value) {
    selectCommand(activeSuggestion.value)
    return
  }

  const person = visiblePeople.value[activeSuggestion.value]
  if (person) selectPerson(person)
  else submitPeopleSearch()
}

function handleKeydown(event: KeyboardEvent) {
  if (!suggestionsOpen.value || optionCount.value === 0) return

  if (event.key === 'ArrowDown') {
    event.preventDefault()
    activeSuggestion.value = (activeSuggestion.value + 1) % optionCount.value
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    activeSuggestion.value = (activeSuggestion.value - 1 + optionCount.value) % optionCount.value
  } else if (event.key === 'Enter' || event.key === 'Tab') {
    event.preventDefault()
    selectActiveSuggestion()
  } else if (event.key === 'Escape') {
    event.preventDefault()
    focused.value = false
  }
}
</script>

<template>
  <form class="search-form" role="search" @submit.prevent="submitSearch">
    <div class="search-input-wrap">
      <input
        ref="input"
        v-model="query"
        class="search-input"
        placeholder="검색 또는 @사람, /명령어"
        autocomplete="off"
        aria-label="전체 검색"
        aria-autocomplete="list"
        :aria-expanded="suggestionsOpen"
        aria-controls="search-suggestion-list"
        :aria-activedescendant="activeDescendant"
        @focus="focused = true"
        @input="focused = true"
        @blur="focused = false"
        @keydown="handleKeydown"
      />

      <ul
        v-if="commandPanelOpen"
        id="search-suggestion-list"
        class="search-command-list"
        role="listbox"
      >
        <li
          v-for="(suggestion, index) in commandSuggestions"
          :id="`search-command-${index}`"
          :key="suggestion.command"
          class="search-command-option"
          :class="{ 'search-command-option--active': index === activeSuggestion }"
          role="option"
          :aria-selected="index === activeSuggestion"
          @mouseenter="activeSuggestion = index"
          @mousedown.prevent="selectCommand(index)"
        >
          <code>{{ suggestion.command }}</code>
          <span>
            <strong>{{ suggestion.label }}</strong>
            <small>{{ suggestion.description }}</small>
          </span>
        </li>
      </ul>

      <div
        v-else-if="peoplePanelOpen"
        id="search-suggestion-list"
        class="search-people-list"
        role="listbox"
        aria-label="사람 검색 결과"
      >
        <div class="search-people-heading">
          <strong>사람</strong>
          <span v-if="peopleLoading">검색 중…</span>
        </div>

        <button
          v-for="(person, index) in visiblePeople"
          :id="`search-person-${index}`"
          :key="person.id"
          type="button"
          class="search-person-option"
          :class="{ 'search-person-option--active': index === activeSuggestion }"
          role="option"
          :aria-selected="index === activeSuggestion"
          @mouseenter="activeSuggestion = index"
          @mousedown.prevent="selectPerson(person)"
        >
          <img
            v-if="person.profile_image_url"
            :src="person.profile_image_url"
            alt=""
            class="search-person-avatar"
          />
          <span v-else class="search-person-avatar search-person-avatar--fallback">
            {{ person.name.trim().charAt(0).toUpperCase() || '?' }}
          </span>
          <span class="search-person-copy">
            <strong>{{ person.name }}</strong>
            <small>{{ person.headline }}</small>
          </span>
        </button>

        <p v-if="peopleError" class="search-people-state" role="alert">{{ peopleError }}</p>
        <p v-else-if="!peopleLoading && visiblePeople.length === 0" class="search-people-state">
          바로 일치하는 사람이 없습니다.
        </p>

        <button
          :id="`search-person-${visiblePeople.length}`"
          type="button"
          class="search-people-all"
          :class="{
            'search-person-option--active': activeSuggestion === visiblePeople.length,
          }"
          role="option"
          :aria-selected="activeSuggestion === visiblePeople.length"
          @mouseenter="activeSuggestion = visiblePeople.length"
          @mousedown.prevent="submitPeopleSearch"
        >
          <span class="search-people-all-icon">⌕</span>
          사람에서 “{{ peopleLookupText }}” 검색
          <kbd>Enter</kbd>
        </button>
      </div>
    </div>
    <button type="submit" class="search-button" aria-label="검색">⌕</button>
  </form>
</template>

<style scoped src="../styles/search-input.css"></style>

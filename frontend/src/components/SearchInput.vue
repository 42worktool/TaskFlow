<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { criteriaToRouteQuery, parseSearchExpression } from '../utils/searchQuery'

const props = defineProps<{
  initialQuery?: string
}>()

const router = useRouter()
const route = useRoute()
const query = ref(props.initialQuery ?? '')
const input = ref<HTMLInputElement | null>(null)
const focused = ref(false)
const activeSuggestion = ref(0)

const commands = [
  { command: '/card', insert: '/card ', label: '카드만', description: '카드 결과만 검색' },
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
] as const

const currentWorkspace = computed(() => {
  const value = route.query.workspace
  const selected = Array.isArray(value) ? value[0] : value
  return typeof selected === 'string' && selected.trim() ? selected.trim() : null
})

const hasWorkspaceContext = computed(() =>
  Boolean(parseSearchExpression(query.value, currentWorkspace.value).workspace),
)

const activeSlashToken = computed(() => {
  const match = query.value.match(/(^|\s)(\/[^\s]*)$/)
  return match?.[2]?.toLocaleLowerCase() ?? null
})

const suggestions = computed(() => {
  const token = activeSlashToken.value
  if (!token) return []
  return commands.filter((item) => {
    if (item.command === '/label:' && !hasWorkspaceContext.value) return false
    return item.command.startsWith(token) || item.label.toLocaleLowerCase().includes(token.slice(1))
  })
})

const suggestionsOpen = computed(() => focused.value && suggestions.value.length > 0)

watch(
  () => [props.initialQuery, route.fullPath] as const,
  ([value]) => {
    query.value = value ?? ''
  },
)

watch(suggestions, () => {
  activeSuggestion.value = 0
})

function submitSearch() {
  const criteria = parseSearchExpression(query.value, currentWorkspace.value)
  router.push({ path: '/search', query: criteriaToRouteQuery(criteria) })
}

function selectSuggestion(index: number) {
  const suggestion = suggestions.value[index]
  const token = activeSlashToken.value
  if (!suggestion || !token) return

  const tokenStart = query.value.length - token.length
  query.value = `${query.value.slice(0, tokenStart)}${suggestion.insert}`
  activeSuggestion.value = 0
  void nextTick(() => input.value?.focus())
}

function handleKeydown(event: KeyboardEvent) {
  if (!suggestionsOpen.value) return

  if (event.key === 'ArrowDown') {
    event.preventDefault()
    activeSuggestion.value = (activeSuggestion.value + 1) % suggestions.value.length
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    activeSuggestion.value =
      (activeSuggestion.value - 1 + suggestions.value.length) % suggestions.value.length
  } else if (event.key === 'Enter' || event.key === 'Tab') {
    event.preventDefault()
    selectSuggestion(activeSuggestion.value)
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
        placeholder="검색 또는 / 명령어"
        autocomplete="off"
        aria-label="전체 검색"
        aria-autocomplete="list"
        :aria-expanded="suggestionsOpen"
        aria-controls="search-command-list"
        :aria-activedescendant="suggestionsOpen ? `search-command-${activeSuggestion}` : undefined"
        @focus="focused = true"
        @input="focused = true"
        @blur="focused = false"
        @keydown="handleKeydown"
      />

      <ul
        v-if="suggestionsOpen"
        id="search-command-list"
        class="search-command-list"
        role="listbox"
      >
        <li
          v-for="(suggestion, index) in suggestions"
          :id="`search-command-${index}`"
          :key="suggestion.command"
          class="search-command-option"
          :class="{ 'search-command-option--active': index === activeSuggestion }"
          role="option"
          :aria-selected="index === activeSuggestion"
          @mouseenter="activeSuggestion = index"
          @mousedown.prevent="selectSuggestion(index)"
        >
          <code>{{ suggestion.command }}</code>
          <span>
            <strong>{{ suggestion.label }}</strong>
            <small>{{ suggestion.description }}</small>
          </span>
        </li>
      </ul>
    </div>
    <button type="submit" class="search-button" aria-label="검색">⌕</button>
  </form>
</template>

<style scoped src="../styles/search-input.css"></style>

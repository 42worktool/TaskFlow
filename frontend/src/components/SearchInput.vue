<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'

const props = defineProps<{
  initialQuery?: string
}>()

const router = useRouter()
const query = ref(props.initialQuery ?? '')

watch(
  () => props.initialQuery,
  (value) => {
    query.value = value ?? ''
  },
)

function submitSearch() {
  const trimmed = query.value.trim()
  router.push({ path: '/search', query: trimmed ? { q: trimmed } : {} })
}
</script>

<template>
  <form class="search-form" role="search" @submit.prevent="submitSearch">
    <input v-model="query" class="search-input" placeholder="검색..." />
    <button type="submit" class="search-button" aria-label="검색">⌕</button>
  </form>
</template>

<style scoped src="../styles/search-input.css"></style>

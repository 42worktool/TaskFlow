<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import AppHeader from '../components/AppHeader.vue'
import { ListAPI } from '../api/list'
import { WorkspaceAPI } from '../api/workspace'
import { workspaceColor } from '../types'
import type { ListWithCards, Workspace } from '../types'

const route = useRoute()
const query = computed(() => String(route.query.q ?? '').trim())
const allWorkspaces = ref<Workspace[]>([])
const lists = ref<ListWithCards[]>([])
const loading = ref(true)
const loadError = ref('')

const workspaceResults = computed(() => {
  const q = query.value.toLowerCase()
  if (!q) return []
  return allWorkspaces.value.filter((workspace) => workspace.name.toLowerCase().includes(q))
})

const cardResults = computed(() => {
  const q = query.value.toLowerCase()
  if (!q) return []
  return lists.value.flatMap((list) => {
    const workspace = allWorkspaces.value.find((item) => item.id === list.workspace_id)
    if (!workspace) return []

    return list.cards
      .filter((card) => {
        const description = card.description ?? ''
        return (
          card.title.toLowerCase().includes(q) ||
          description.toLowerCase().includes(q)
        )
      })
      .map((card) => ({ card, list, workspace }))
  })
})

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

onMounted(() => {
  void loadSearchData()
})

const hasResults = computed(() => workspaceResults.value.length > 0 || cardResults.value.length > 0)
</script>

<template>
  <div class="search-shell">
    <AppHeader :initial-query="query" />

    <main class="search-page">
      <div class="search-heading">
        <h1 class="search-title">검색</h1>
        <p v-if="query" class="search-summary">"{{ query }}" 검색 결과</p>
        <p v-else class="search-summary">워크스페이스와 카드를 검색하세요.</p>
      </div>

      <div v-if="loadError" class="empty-state" role="alert">{{ loadError }}</div>
      <div v-else-if="loading" class="empty-state" role="status">검색 데이터를 불러오는 중…</div>
      <div v-else-if="!query" class="empty-state">검색어를 입력하면 결과가 표시됩니다.</div>

      <template v-else-if="hasResults">
        <section class="result-section">
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

        <section class="result-section">
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
              </div>
            </RouterLink>
          </div>
          <div v-else class="section-empty">일치하는 카드가 없습니다.</div>
        </section>
      </template>

      <div v-else class="empty-state">검색 결과가 없습니다.</div>
    </main>

  </div>
</template>

<style scoped src="../styles/search.css"></style>

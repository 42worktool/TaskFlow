<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import InboxDrawer from '../components/InboxDrawer.vue'
import NotificationMenu from '../components/NotificationMenu.vue'
import ProfileMenu from '../components/ProfileMenu.vue'
import SearchInput from '../components/SearchInput.vue'
import { cards, lists, myWorkspaces, openWorkspaces } from '../mock/data'
import { workspaceColor } from '../types'

const route = useRoute()
const query = computed(() => String(route.query.q ?? '').trim())
const showInbox = ref(false)

const allWorkspaces = [...myWorkspaces, ...openWorkspaces]

const workspaceResults = computed(() => {
  const q = query.value.toLowerCase()
  if (!q) return []
  return allWorkspaces.filter((workspace) => workspace.name.toLowerCase().includes(q))
})

const cardResults = computed(() => {
  const q = query.value.toLowerCase()
  if (!q) return []
  return cards
    .filter((card) => {
      const description = card.description ?? ''
      const label = card.label ?? ''
      return (
        card.title.toLowerCase().includes(q) ||
        description.toLowerCase().includes(q) ||
        label.toLowerCase().includes(q)
      )
    })
    .map((card) => {
      const list = lists.find((item) => item.id === card.list_id)
      const workspace =
        allWorkspaces.find((item) => item.id === list?.workspace_id) ?? myWorkspaces[0]
      return { card, list, workspace }
    })
})

const hasResults = computed(() => workspaceResults.value.length > 0 || cardResults.value.length > 0)
</script>

<template>
  <div class="search-shell">
    <header class="search-header">
      <RouterLink to="/workspaces" class="logo">TaskFlow</RouterLink>
      <SearchInput :initial-query="query" />
      <div class="header-actions">
        <NotificationMenu />
        <button class="inbox-btn" type="button" @click="showInbox = true">인박스</button>
        <ProfileMenu />
      </div>
    </header>

    <main class="search-page">
      <div class="search-heading">
        <h1 class="search-title">검색</h1>
        <p v-if="query" class="search-summary">"{{ query }}" 검색 결과</p>
        <p v-else class="search-summary">프로젝트와 카드를 검색하세요.</p>
      </div>

      <div v-if="!query" class="empty-state">검색어를 입력하면 결과가 표시됩니다.</div>

      <template v-else-if="hasResults">
        <section class="result-section">
          <div class="section-header">
            <h2 class="section-title">프로젝트</h2>
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
                  {{ workspace.is_public ? '공개 프로젝트' : '비공개 프로젝트' }} · 멤버
                  {{ workspace.members.length }}명
                </p>
              </div>
              <span class="result-arrow">→</span>
            </RouterLink>
          </div>
          <div v-else class="section-empty">일치하는 프로젝트가 없습니다.</div>
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
              :to="`/workspaces/${result.workspace.id}/board`"
              class="result-row"
            >
              <span class="card-marker" />
              <div class="result-content">
                <p class="result-title">{{ result.card.title }}</p>
                <p class="result-meta">
                  {{ result.workspace.name }} · {{ result.list?.name ?? '목록 없음' }}
                </p>
              </div>
              <span v-if="result.card.label" class="label-chip">{{ result.card.label }}</span>
            </RouterLink>
          </div>
          <div v-else class="section-empty">일치하는 카드가 없습니다.</div>
        </section>
      </template>

      <div v-else class="empty-state">검색 결과가 없습니다.</div>
    </main>

    <InboxDrawer :open="showInbox" @close="showInbox = false" />
  </div>
</template>

<style scoped src="../styles/search.css"></style>

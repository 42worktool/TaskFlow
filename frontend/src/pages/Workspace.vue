<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink } from 'vue-router'
import InboxDrawer from '../components/InboxDrawer.vue'
import LegalFooter from '../components/LegalFooter.vue'
import NotificationMenu from '../components/NotificationMenu.vue'
import ProfileMenu from '../components/ProfileMenu.vue'
import SearchInput from '../components/SearchInput.vue'
import { myWorkspaces } from '../mock/data'

const showInbox = ref(false)
</script>

<template>
  <div class="home-shell">
    <!-- Header -->
    <header class="home-header">
      <RouterLink to="/workspaces" class="logo">TaskFlow</RouterLink>
      <SearchInput />
      <div class="header-actions">
        <NotificationMenu />
        <button class="inbox-btn" type="button" @click="showInbox = true">인박스</button>
        <ProfileMenu />
      </div>
    </header>

    <div class="home-body">
      <!-- Content -->
      <main class="home-content">
        <!-- 내 프로젝트 -->
        <section class="project-section">
          <h2 class="section-title">내 프로젝트</h2>
          <p class="section-desc">소속된 비공개 프로젝트</p>
          <div class="project-grid">
            <RouterLink
              v-for="ws in myWorkspaces"
              :key="ws.id"
              :to="`/workspaces/${ws.id}/board`"
              class="project-card"
            >
              <div class="card-color-bar" :style="{ background: ws.color }" />
              <div class="card-body">
                <h3 class="card-name">{{ ws.name }}</h3>
                <span class="card-badge card-badge--private">비공개</span>
                <div class="card-footer">
                  <span class="card-members">멤버 {{ ws.member_count }}명</span>
                  <span class="card-arrow">→</span>
                </div>
              </div>
            </RouterLink>
            <div class="project-card project-card--new">
              <div class="new-card-inner">
                <span class="new-icon">+</span>
                <span class="new-label">새 프로젝트 추가</span>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>

    <div class="home-footer">
      <LegalFooter variant="light" />
    </div>

    <InboxDrawer :open="showInbox" @close="showInbox = false" />
  </div>
</template>

<style scoped src="../styles/workspace-home.css"></style>

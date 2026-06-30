<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink } from 'vue-router'
import { myWorkspaces, openWorkspaces, currentUser } from '../mock/data'

const activeNav = ref('홈')
</script>

<template>
  <div class="home-shell">
    <!-- Header -->
    <header class="home-header">
      <span class="logo">TaskFlow</span>
      <div class="search-wrap">
        <input class="search-input" placeholder="검색..." />
      </div>
      <nav class="header-nav">
        <button class="header-nav-btn">최근</button>
        <button class="header-nav-btn">스타 표시</button>
        <button class="header-nav-btn">내 팀</button>
      </nav>
      <button class="new-btn">+ 새로 만들기</button>
      <div class="user-avatar" :style="{ background: currentUser.avatar_color }">
        {{ currentUser.avatar }}
      </div>
    </header>

    <div class="home-body">
      <!-- Sidebar -->
      <nav class="home-sidebar">
        <ul class="sidebar-menu">
          <li
            v-for="item in ['홈', '내 카드', '설정']"
            :key="item"
            class="sidebar-item"
            :class="{ 'sidebar-item--active': activeNav === item }"
            @click="activeNav = item"
          >
            {{ item }}
          </li>
        </ul>
      </nav>

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

        <!-- 오픈 프로젝트 -->
        <section class="project-section">
          <h2 class="section-title">오픈 프로젝트</h2>
          <p class="section-desc">누구나 열람하고 참여할 수 있는 공개 보드</p>
          <div class="project-grid">
            <RouterLink
              v-for="ws in openWorkspaces"
              :key="ws.id"
              :to="`/workspaces/${ws.id}/board`"
              class="project-card"
            >
              <div class="card-color-bar" :style="{ background: ws.color }" />
              <div class="card-body">
                <h3 class="card-name">{{ ws.name }}</h3>
                <span class="card-badge card-badge--public">공개</span>
                <div class="card-footer">
                  <span class="card-members">멤버 {{ ws.member_count }}명</span>
                  <span class="card-arrow">→</span>
                </div>
              </div>
            </RouterLink>
          </div>
        </section>
      </main>
    </div>
  </div>
</template>

<style scoped>
.home-shell {
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #f3f4f6;
}

.home-header {
  height: 52px;
  background: #1a3a6b;
  display: flex;
  align-items: center;
  padding: 0 20px;
  gap: 16px;
  flex-shrink: 0;
}

.logo {
  font-size: 16px;
  font-weight: 700;
  color: #fff;
  margin-right: 8px;
}

.search-wrap {
  flex: 1;
  max-width: 480px;
}

.search-input {
  width: 100%;
  padding: 7px 14px;
  background: rgba(255, 255, 255, 0.15);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  font-size: 14px;
  color: #fff;
  outline: none;
}

.search-input::placeholder {
  color: rgba(255, 255, 255, 0.55);
}

.header-nav {
  display: flex;
  gap: 4px;
  margin-left: auto;
}

.header-nav-btn {
  padding: 6px 12px;
  background: none;
  border: none;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.8);
  cursor: pointer;
  border-radius: 6px;
}

.header-nav-btn:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.1);
}

.new-btn {
  padding: 7px 16px;
  background: #2563eb;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  color: #fff;
  cursor: pointer;
  white-space: nowrap;
}

.new-btn:hover {
  background: #1d4ed8;
}

.user-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 700;
  color: #fff;
  flex-shrink: 0;
}

.home-body {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.home-sidebar {
  width: 200px;
  flex-shrink: 0;
  background: #fff;
  border-right: 1px solid #e5e7eb;
  padding: 12px 0;
}

.sidebar-menu {
  list-style: none;
}

.sidebar-item {
  padding: 10px 20px;
  font-size: 14px;
  color: #374151;
  cursor: pointer;
  border-radius: 0;
}

.sidebar-item:hover {
  background: #f3f4f6;
}

.sidebar-item--active {
  background: #eff6ff;
  color: #2563eb;
  font-weight: 600;
}

.home-content {
  flex: 1;
  overflow-y: auto;
  padding: 32px 36px;
}

.project-section {
  margin-bottom: 40px;
}

.section-title {
  font-size: 20px;
  font-weight: 700;
  color: #111827;
  margin-bottom: 4px;
}

.section-desc {
  font-size: 13px;
  color: #6b7280;
  margin-bottom: 20px;
}

.project-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}

.project-card {
  background: #fff;
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid #e5e7eb;
  text-decoration: none;
  color: inherit;
  display: block;
  transition: box-shadow 0.15s;
}

.project-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.card-color-bar {
  height: 5px;
}

.card-body {
  padding: 16px;
}

.card-name {
  font-size: 14px;
  font-weight: 600;
  color: #111827;
  margin-bottom: 10px;
}

.card-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  margin-bottom: 14px;
}

.card-badge--private {
  background: #f3f4f6;
  color: #6b7280;
}

.card-badge--public {
  background: #eff6ff;
  color: #2563eb;
}

.card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.card-members {
  font-size: 13px;
  color: #6b7280;
}

.card-arrow {
  font-size: 14px;
  color: #9ca3af;
}

.project-card--new {
  border: 2px dashed #d1d5db;
  background: #fafafa;
  cursor: pointer;
  min-height: 120px;
}

.project-card--new:hover {
  border-color: #2563eb;
  box-shadow: none;
}

.new-card-inner {
  height: 100%;
  min-height: 120px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: #9ca3af;
}

.new-icon {
  font-size: 22px;
  line-height: 1;
}

.new-label {
  font-size: 13px;
}
</style>

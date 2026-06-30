<script setup lang="ts">
import { ref } from 'vue'
import { notifications } from '../mock/data'

const activeTab = ref<'알림' | '멘션' | '업데이트'>('알림')
</script>

<template>
  <aside class="inbox-panel">
    <h2 class="inbox-title">인박스</h2>
    <div class="inbox-tabs">
      <button
        v-for="tab in ['알림', '멘션', '업데이트'] as const"
        :key="tab"
        class="tab-btn"
        :class="{ active: activeTab === tab }"
        @click="activeTab = tab"
      >
        {{ tab }}
      </button>
    </div>
    <ul class="notif-list">
      <li v-for="n in notifications" :key="n.id" class="notif-item">
        <span class="unread-dot" :class="{ visible: !n.read }" />
        <div class="notif-avatar" :style="{ background: n.avatar_color }">
          {{ n.avatar }}
        </div>
        <div class="notif-content">
          <p class="notif-text">{{ n.text }}</p>
          <span class="notif-time">{{ n.time }}</span>
        </div>
      </li>
    </ul>
  </aside>
</template>

<style scoped>
.inbox-panel {
  width: 270px;
  flex-shrink: 0;
  border-left: 1px solid #e5e7eb;
  background: #fff;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.inbox-title {
  font-size: 15px;
  font-weight: 600;
  padding: 16px 20px 0;
  color: #111827;
}

.inbox-tabs {
  display: flex;
  gap: 4px;
  padding: 10px 20px 0;
  border-bottom: 1px solid #e5e7eb;
}

.tab-btn {
  padding: 6px 4px;
  font-size: 13px;
  color: #6b7280;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  cursor: pointer;
  margin-right: 12px;
}

.tab-btn.active {
  color: #2563EB;
  border-bottom-color: #2563EB;
  font-weight: 600;
}

.notif-list {
  list-style: none;
  overflow-y: auto;
  flex: 1;
  padding: 8px 0;
}

.notif-item {
  display: flex;
  align-items: flex-start;
  padding: 12px 20px;
  gap: 10px;
  border-bottom: 1px solid #f3f4f6;
  cursor: pointer;
}

.notif-item:hover {
  background: #f9fafb;
}

.unread-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: transparent;
  margin-top: 5px;
  flex-shrink: 0;
}

.unread-dot.visible {
  background: #2563EB;
}

.notif-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 600;
  color: #fff;
  flex-shrink: 0;
  background: #6b7280;
}

.notif-content {
  flex: 1;
  min-width: 0;
}

.notif-text {
  font-size: 13px;
  color: #111827;
  line-height: 1.4;
  margin-bottom: 2px;
}

.notif-time {
  font-size: 12px;
  color: #9ca3af;
}
</style>

<script setup lang="ts">
import { computed } from 'vue'
import { lists, cards } from '../mock/data'

const columns = computed(() =>
  lists.map((list) => ({
    ...list,
    cards: cards.filter((c) => c.list_id === list.id),
  })),
)

const badgeColors: Record<string, string> = {
  '할 일': '#6b7280',
  '진행 중': '#2563EB',
  '검토 중': '#F59E0B',
  완료: '#10B981',
}

function formatDate(iso: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()}`
}
</script>

<template>
  <div class="board-page">
    <div class="board-toolbar">
      <button class="toolbar-btn toolbar-btn--primary">+ 카드 추가</button>
      <button class="toolbar-btn">필터</button>
      <button class="toolbar-btn">정렬</button>
    </div>

    <div class="board-columns">
      <div v-for="col in columns" :key="col.id" class="column">
        <div class="column-header">
          <span class="column-name">{{ col.name }}</span>
          <span class="column-count" :style="{ background: badgeColors[col.name] }">
            {{ col.cards.length }}
          </span>
        </div>

        <ul class="card-list">
          <li v-for="card in col.cards" :key="card.id" class="board-card">
            <p class="card-title">{{ card.title }}</p>
            <div class="card-meta">
              <span
                v-if="card.label"
                class="card-label"
                :style="{
                  background: (card.label_color ?? '#6b7280') + '20',
                  color: card.label_color ?? '#6b7280',
                }"
              >
                {{ card.label }}
              </span>
              <span class="card-date">{{ formatDate(card.deadline) }}</span>
              <div class="card-assignee" />
            </div>
          </li>
        </ul>

        <button class="add-card-btn">+ 카드 추가</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.board-page {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #f3f4f6;
}

.board-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 20px;
  background: #fff;
  border-bottom: 1px solid #e5e7eb;
  flex-shrink: 0;
}

.toolbar-btn {
  padding: 7px 14px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  font-size: 13px;
  color: #374151;
  background: #fff;
  cursor: pointer;
}

.toolbar-btn:hover {
  background: #f9fafb;
}

.toolbar-btn--primary {
  background: #2563eb;
  color: #fff;
  border-color: #2563eb;
}

.toolbar-btn--primary:hover {
  background: #1d4ed8;
}

.board-columns {
  flex: 1;
  display: flex;
  gap: 14px;
  padding: 16px 20px;
  overflow-x: auto;
}

.column {
  width: 280px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: #e9ebee;
  border-radius: 10px;
  padding: 12px;
  max-height: 100%;
}

.column-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.column-name {
  font-size: 14px;
  font-weight: 600;
  color: #374151;
}

.column-count {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  color: #fff;
}

.card-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
  flex: 1;
  margin-bottom: 8px;
}

.board-card {
  background: #fff;
  border-radius: 8px;
  padding: 12px;
  cursor: pointer;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.board-card:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
}

.card-title {
  font-size: 14px;
  color: #111827;
  margin-bottom: 10px;
  font-weight: 500;
}

.card-meta {
  display: flex;
  align-items: center;
  gap: 6px;
}

.card-label {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
}

.card-date {
  font-size: 12px;
  color: #6b7280;
  margin-left: auto;
}

.card-assignee {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #d1d5db;
  flex-shrink: 0;
}

.add-card-btn {
  width: 100%;
  padding: 8px;
  background: transparent;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  color: #6b7280;
  cursor: pointer;
  text-align: left;
  margin-top: 4px;
}

.add-card-btn:hover {
  background: rgba(0, 0, 0, 0.05);
  color: #374151;
}
</style>

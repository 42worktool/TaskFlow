<script setup lang="ts">
import { ref } from 'vue'
import { WorkspaceAPI } from '../api/workspace'
import type { Workspace } from '../types'

const props = defineProps<{ workspace: Workspace }>()
const emit = defineEmits<{ close: []; updated: [Workspace] }>()

const name = ref(props.workspace.name)
const isPublic = ref(props.workspace.is_public)
const loading = ref(false)
const error = ref('')

async function submit() {
  const trimmed = name.value.trim()
  if (!trimmed) {
    error.value = '워크스페이스 이름을 입력해주세요.'
    return
  }
  loading.value = true
  error.value = ''
  try {
    const ws = await WorkspaceAPI.update(props.workspace.id, {
      name: trimmed,
      is_public: isPublic.value,
    })
    emit('updated', ws)
    emit('close')
  } catch {
    error.value = '수정에 실패했습니다. 다시 시도해주세요.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal">
      <div class="modal-header">
        <h2 class="modal-title">프로젝트 수정</h2>
        <button class="close-btn" type="button" @click="$emit('close')">✕</button>
      </div>

      <form class="modal-body" @submit.prevent="submit">
        <label class="field">
          <span class="field-label">이름</span>
          <input
            v-model="name"
            class="field-input"
            type="text"
            maxlength="100"
            autofocus
          />
        </label>

        <label class="field-check">
          <input v-model="isPublic" type="checkbox" />
          <span>공개 프로젝트</span>
        </label>

        <p v-if="error" class="field-error">{{ error }}</p>

        <div class="modal-actions">
          <button class="btn btn--secondary" type="button" @click="$emit('close')">취소</button>
          <button class="btn btn--primary" type="submit" :disabled="loading || !name.trim()">
            {{ loading ? '저장 중…' : '저장' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}
.modal {
  background: #fff;
  border-radius: 12px;
  width: 400px;
  max-width: 90vw;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.18);
}
.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px 0;
}
.modal-title {
  font-size: 18px;
  font-weight: 700;
  margin: 0;
}
.close-btn {
  background: none;
  border: none;
  font-size: 18px;
  cursor: pointer;
  color: #6b7280;
}
.modal-body {
  padding: 20px 24px 24px;
}
.field {
  display: block;
  margin-bottom: 16px;
}
.field-label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: #374151;
  margin-bottom: 6px;
}
.field-input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 14px;
  box-sizing: border-box;
  outline: none;
  transition: border-color 0.15s;
}
.field-input:focus {
  border-color: #2563eb;
}
.field-check {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: #374151;
  cursor: pointer;
  margin-bottom: 16px;
}
.field-error {
  color: #ef4444;
  font-size: 13px;
  margin: 0 0 12px;
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.btn {
  padding: 8px 18px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  border: none;
  cursor: pointer;
}
.btn:disabled {
  opacity: 0.5;
  cursor: default;
}
.btn--secondary {
  background: #f3f4f6;
  color: #374151;
}
.btn--primary {
  background: #2563eb;
  color: #fff;
}
</style>

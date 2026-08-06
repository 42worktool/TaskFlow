<script setup lang="ts">
import { computed, ref } from 'vue'
import { WorkspaceAPI } from '../api/workspace'
import type { Workspace } from '../types'

const props = defineProps<{ workspace?: Workspace }>()
const emit = defineEmits<{ close: []; saved: [Workspace] }>()

const editing = computed(() => props.workspace !== undefined)
const name = ref(props.workspace?.name ?? '')
const isPublic = ref(props.workspace?.is_public ?? false)
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
    const workspace = props.workspace
      ? await WorkspaceAPI.update(props.workspace.id, {
          name: trimmed,
          is_public: isPublic.value,
        })
      : await WorkspaceAPI.create(trimmed, isPublic.value)
    emit('saved', workspace)
    emit('close')
  } catch {
    error.value = editing.value
      ? '수정에 실패했습니다. 다시 시도해주세요.'
      : '생성에 실패했습니다. 다시 시도해주세요.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="modal-overlay" @click.self="emit('close')">
    <div class="modal">
      <div class="modal-header">
        <h2 class="modal-title">{{ editing ? '프로젝트 수정' : '새 프로젝트 만들기' }}</h2>
        <button class="close-btn" type="button" @click="emit('close')">✕</button>
      </div>

      <form class="modal-body" @submit.prevent="submit">
        <label class="field">
          <span class="field-label">이름</span>
          <input
            v-model="name"
            class="field-input"
            type="text"
            maxlength="100"
            :placeholder="editing ? undefined : '프로젝트 이름을 입력하세요'"
            autofocus
          />
        </label>

        <label class="field-check">
          <input v-model="isPublic" type="checkbox" />
          <span>{{ editing ? '공개 프로젝트' : '공개 프로젝트로 생성' }}</span>
        </label>

        <p v-if="error" class="field-error">{{ error }}</p>

        <div class="modal-actions">
          <button class="btn btn--secondary" type="button" @click="emit('close')">취소</button>
          <button class="btn btn--primary" type="submit" :disabled="loading || !name.trim()">
            {{ loading ? (editing ? '저장 중…' : '생성 중…') : editing ? '저장' : '만들기' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<style scoped src="../styles/workspace-form-modal.css"></style>

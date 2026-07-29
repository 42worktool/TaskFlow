<script setup lang="ts">
import { ref } from 'vue'
import { WorkspaceAPI } from '../api/workspace'
import type { Workspace } from '../types'

const props = defineProps<{
  workspaceName: string
  workspaceId: string
  workspace: Workspace
}>()
defineEmits<{ close: [] }>()

const inviteEmail = ref('')
const inviteRole = ref<'ADMIN' | 'MEMBER' | 'VIEWER'>('MEMBER')
const sending = ref(false)
const error = ref('')
const success = ref('')
const removing = ref<string | null>(null)

const roleLabels: Record<string, string> = {
  OWNER: '소유자',
  ADMIN: '관리자',
  MEMBER: '멤버',
  VIEWER: '뷰어',
}

const inviteRoles: { value: 'ADMIN' | 'MEMBER' | 'VIEWER'; label: string }[] = [
  { value: 'MEMBER', label: '멤버' },
  { value: 'ADMIN', label: '관리자' },
  { value: 'VIEWER', label: '뷰어' },
]

async function sendInvite() {
  if (sending.value || !inviteEmail.value.trim()) return
  sending.value = true
  error.value = ''
  success.value = ''
  try {
    await WorkspaceAPI.inviteMember(props.workspaceId, inviteEmail.value, inviteRole.value)
    inviteEmail.value = ''
    success.value = '초대 메일 전송을 요청했습니다.'
  } catch (caught) {
    error.value =
      caught instanceof Error ? caught.message : '초대를 보내지 못했습니다.'
  } finally {
    sending.value = false
  }
}

async function handleRemoveMember(userId: string) {
  removing.value = userId
  error.value = ''
  try {
    await WorkspaceAPI.removeMember(props.workspaceId, userId)
    const index = props.workspace.members.findIndex((m) => m.user_id === userId)
    if (index !== -1) props.workspace.members.splice(index, 1)
  } catch (e: any) {
    error.value = e.message || '멤버를 제거하지 못했습니다.'
  } finally {
    removing.value = null
  }
}
</script>

<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal">
      <div class="modal-header">
        <div>
          <h2 class="modal-title">팀원 초대</h2>
          <p class="modal-subtitle">{{ workspaceName }} · 공유 설정</p>
        </div>
        <button class="close-btn" @click="$emit('close')">✕</button>
      </div>

      <div class="section">
        <p class="section-label">이메일로 초대</p>
        <div class="invite-row">
          <input
            v-model="inviteEmail"
            class="invite-input"
            placeholder="이메일 주소 입력..."
            @keyup.enter="sendInvite"
          />
          <select v-model="inviteRole" class="role-btn">
            <option v-for="r in inviteRoles" :key="r.value" :value="r.value">{{ r.label }}</option>
          </select>
        </div>
        <button class="send-btn" :disabled="sending" @click="sendInvite">
          {{ sending ? '전송 중...' : '초대 메일 보내기' }}
        </button>
        <p v-if="error" class="error-text">{{ error }}</p>
        <p v-if="success" class="success-text" role="status">{{ success }}</p>
      </div>

      <div class="section">
        <p class="section-label">현재 팀원</p>
        <ul class="member-list">
          <li v-for="m in props.workspace.members" :key="m.user_id" class="member-item">
            <div
              class="member-avatar"
              :style="{
                background:
                  m.role === 'OWNER' ? '#2563EB' : m.role === 'ADMIN' ? '#10B981' : '#7C3AED',
              }"
            >
              {{ m.user.name[0] }}
            </div>
            <div class="member-info">
              <p class="member-name">{{ m.user.name }}</p>
              <p class="member-email">{{ m.user.email }}</p>
            </div>
            <div class="member-actions">
              <span class="role-badge">{{ roleLabels[m.role] }}</span>
              <button
                v-if="m.role !== 'OWNER'"
                class="remove-btn"
                :disabled="removing === m.user_id"
                @click="handleRemoveMember(m.user_id)"
              >
                {{ removing === m.user_id ? '제거 중...' : '제거' }}
              </button>
            </div>
          </li>
        </ul>
      </div>

      <div class="modal-footer">
        <button class="close-footer-btn" @click="$emit('close')">닫기</button>
      </div>
    </div>
  </div>
</template>

<style scoped src="../styles/share-modal.css"></style>

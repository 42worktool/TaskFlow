<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { WorkspaceAPI } from '../api/workspace'
import type { WorkspaceMember } from '../types'

const props = defineProps<{ workspaceName: string; workspaceId: string }>()
defineEmits<{ close: [] }>()

const inviteEmail = ref('')
const inviteLink = computed(() => `taskflow.app/invite/${props.workspaceId}`)
const members = ref<WorkspaceMember[]>([])
const membersError = ref('')
const removingUserId = ref<string | null>(null)

async function loadMembers() {
  membersError.value = ''
  try {
    const ws = await WorkspaceAPI.get(props.workspaceId)
    members.value = ws.members
  } catch (e) {
    membersError.value = e instanceof Error ? e.message : '팀원 목록을 불러오지 못했습니다.'
  }
}

async function removeMember(userId: string) {
  removingUserId.value = userId
  membersError.value = ''
  try {
    await WorkspaceAPI.removeMember(props.workspaceId, userId)
    members.value = members.value.filter((m) => m.user_id !== userId)
  } catch (e) {
    membersError.value = e instanceof Error ? e.message : '팀원 제거에 실패했습니다.'
  } finally {
    removingUserId.value = null
  }
}

onMounted(() => {
  void loadMembers()
})

watch(
  () => props.workspaceId,
  () => {
    void loadMembers()
  },
)

const roleLabels: Record<string, string> = {
  OWNER: '관리자',
  ADMIN: '관리자',
  VIEWER: '뷰어',
  MEMBER: '멤버',
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
          <input v-model="inviteEmail" class="invite-input" placeholder="이메일 주소 입력..." />
          <button class="role-btn">편집자 ▾</button>
        </div>
        <button class="send-btn">메일로 초대 보내기 (mailto:)</button>
      </div>

      <div class="section">
        <p class="section-label">초대 링크</p>
        <div class="link-row">
          <input class="link-input" :value="inviteLink" readonly />
          <button class="copy-btn">복사</button>
        </div>
      </div>

      <div class="section">
        <p class="section-label">현재 팀원</p>
        <p v-if="membersError" class="section-label">{{ membersError }}</p>
        <ul class="member-list">
          <li v-for="m in members" :key="m.user_id" class="member-item">
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
                :disabled="removingUserId === m.user_id"
                @click="removeMember(m.user_id)"
              >
                제거
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

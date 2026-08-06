<script setup lang="ts">
import { ref } from 'vue'
import { WorkspaceAPI } from '../api/workspace'
import type { Workspace, WorkspaceMember, WorkspaceRole } from '../types'
import { canChangeWorkspaceMemberRole } from '../utils/workspacePermissions'

const props = defineProps<{
  workspaceName: string
  workspaceId: string
  workspace: Workspace
  managerRole: WorkspaceRole | null
}>()
const emit = defineEmits<{
  close: []
  workspaceUpdated: [workspace: Workspace]
}>()

const inviteEmail = ref('')
type ManageableWorkspaceRole = Exclude<WorkspaceRole, 'OWNER'>
const inviteRole = ref<ManageableWorkspaceRole>('MEMBER')
const sending = ref(false)
const inviteError = ref('')
const inviteSuccess = ref('')
const memberError = ref('')
const memberSuccess = ref('')
const removing = ref<string | null>(null)
const updatingRole = ref<string | null>(null)

const roleLabels: Record<string, string> = {
  OWNER: '소유자',
  ADMIN: '관리자',
  MEMBER: '멤버',
  VIEWER: '뷰어',
}

const manageableRoles: {
  value: ManageableWorkspaceRole
  label: string
}[] = [
  { value: 'MEMBER', label: '멤버' },
  { value: 'ADMIN', label: '관리자' },
  { value: 'VIEWER', label: '뷰어' },
]

function isManageableRole(value: string): value is ManageableWorkspaceRole {
  return manageableRoles.some((role) => role.value === value)
}

async function sendInvite() {
  if (sending.value || !inviteEmail.value.trim()) return
  sending.value = true
  inviteError.value = ''
  inviteSuccess.value = ''
  try {
    await WorkspaceAPI.inviteMember(props.workspaceId, inviteEmail.value, inviteRole.value)
    inviteEmail.value = ''
    inviteSuccess.value = '초대 메일 전송을 요청했습니다.'
  } catch (caught) {
    inviteError.value = caught instanceof Error ? caught.message : '초대를 보내지 못했습니다.'
  } finally {
    sending.value = false
  }
}

async function handleRoleChange(member: WorkspaceMember, event: Event): Promise<void> {
  const select = event.currentTarget
  if (!(select instanceof HTMLSelectElement)) return

  const role = select.value
  if (
    updatingRole.value ||
    !isManageableRole(role) ||
    role === member.role ||
    !canChangeWorkspaceMemberRole(props.managerRole, member.role)
  ) {
    select.value = member.role
    return
  }

  updatingRole.value = member.user_id
  memberError.value = ''
  memberSuccess.value = ''
  try {
    const updated = await WorkspaceAPI.changeMemberRole(props.workspaceId, member.user_id, role)
    emit('workspaceUpdated', updated)
    memberSuccess.value = `${member.user.name}님의 권한을 ${roleLabels[role]}(으)로 변경했습니다.`
  } catch (caught) {
    select.value = member.role
    memberError.value =
      caught instanceof Error ? caught.message : '멤버 권한을 변경하지 못했습니다.'
  } finally {
    updatingRole.value = null
  }
}

async function handleRemoveMember(userId: string) {
  removing.value = userId
  memberError.value = ''
  memberSuccess.value = ''
  try {
    await WorkspaceAPI.removeMember(props.workspaceId, userId)
    emit('workspaceUpdated', {
      ...props.workspace,
      members: props.workspace.members.filter((member) => member.user_id !== userId),
    })
  } catch (caught) {
    memberError.value = caught instanceof Error ? caught.message : '멤버를 제거하지 못했습니다.'
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
          <h2 class="modal-title">팀원 관리</h2>
          <p class="modal-subtitle">{{ workspaceName }} · 초대 및 구성원</p>
        </div>
        <button class="close-btn" @click="$emit('close')">✕</button>
      </div>

      <div class="section">
        <p class="section-label">이메일로 초대</p>
        <div class="invite-row">
          <input
            v-model="inviteEmail"
            class="invite-input"
            type="email"
            autocomplete="email"
            placeholder="이메일 주소 입력..."
            required
            @keyup.enter="sendInvite"
          />
          <select v-model="inviteRole" class="role-btn">
            <option v-for="r in manageableRoles" :key="r.value" :value="r.value">
              {{ r.label }}
            </option>
          </select>
        </div>
        <button class="send-btn" :disabled="sending || !inviteEmail.trim()" @click="sendInvite">
          {{ sending ? '전송 중...' : '초대 메일 보내기' }}
        </button>
        <p v-if="inviteError" class="error-text">{{ inviteError }}</p>
        <p v-if="inviteSuccess" class="success-text" role="status">{{ inviteSuccess }}</p>
      </div>

      <div class="section">
        <p class="section-label">현재 팀원</p>
        <p v-if="memberError" class="error-text">{{ memberError }}</p>
        <p v-if="memberSuccess" class="success-text" role="status">
          {{ memberSuccess }}
        </p>
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
              <p v-if="m.user.email" class="member-email">{{ m.user.email }}</p>
            </div>
            <div class="member-actions">
              <select
                v-if="canChangeWorkspaceMemberRole(managerRole, m.role)"
                class="member-role-select"
                :value="m.role"
                :aria-label="`${m.user.name} 권한 변경`"
                :disabled="updatingRole !== null || removing === m.user_id"
                @change="handleRoleChange(m, $event)"
              >
                <option v-for="role in manageableRoles" :key="role.value" :value="role.value">
                  {{ role.label }}
                </option>
              </select>
              <span v-else class="role-badge">{{ roleLabels[m.role] }}</span>
              <span v-if="updatingRole === m.user_id" class="member-action-status" role="status">
                저장 중...
              </span>
              <button
                v-if="m.role !== 'OWNER'"
                class="remove-btn"
                :disabled="removing === m.user_id || updatingRole === m.user_id"
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

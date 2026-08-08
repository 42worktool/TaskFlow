<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { WorkspaceAPI } from '../api/workspace'
import type { Workspace, WorkspaceMember, WorkspaceRole } from '../types'
import { canAssignWorkspaceRole, canChangeWorkspaceMemberRole } from '../utils/workspacePermissions'

// 초대, 역할 변경, 멤버 제거와 소유권 위임을 한 관리 화면에서 수행한다.
// 현재 관리자의 계급보다 낮은 역할만 제어하도록 공용 권한 규칙을 UI 선택지와 요청 직전에 모두 적용한다.
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
const transferringOwnership = ref<string | null>(null)

const roleLabels: Record<string, string> = {
  OWNER: '소유자',
  ADMIN: '관리자',
  MEMBER: '멤버',
  VIEWER: '뷰어',
}

const workspaceRoles: {
  value: ManageableWorkspaceRole
  label: string
}[] = [
  { value: 'MEMBER', label: '멤버' },
  { value: 'ADMIN', label: '관리자' },
  { value: 'VIEWER', label: '뷰어' },
]

const assignableRoles = computed(() =>
  workspaceRoles.filter((role) => canAssignWorkspaceRole(props.managerRole, role.value)),
)

watch(assignableRoles, (roles) => {
  // 권한이 실시간으로 낮아지면 더 이상 부여할 수 없는 초대 역할을 첫 유효 값으로 즉시 보정한다.
  if (!roles.some((role) => role.value === inviteRole.value) && roles[0]) {
    inviteRole.value = roles[0].value
  }
})

function isManageableRole(value: string): value is ManageableWorkspaceRole {
  return workspaceRoles.some((role) => role.value === value)
}

async function sendInvite() {
  if (sending.value || !inviteEmail.value.trim()) return
  if (!canAssignWorkspaceRole(props.managerRole, inviteRole.value)) {
    inviteError.value = '자신보다 낮은 역할로만 초대할 수 있습니다.'
    return
  }
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

  // 변경된 권한으로 남아 있던 select를 조작할 수 있으므로 요청 직전에도 계층 규칙을 재검사한다.
  const role = select.value
  if (
    updatingRole.value ||
    !isManageableRole(role) ||
    role === member.role ||
    !canChangeWorkspaceMemberRole(props.managerRole, member.role) ||
    !canAssignWorkspaceRole(props.managerRole, role)
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

async function handleOwnershipTransfer(member: WorkspaceMember): Promise<void> {
  // 소유권 이전은 현재 소유자에게만 허용하고 되돌리기 어려운 역할 교환을 확인창으로 명시한다.
  if (props.managerRole !== 'OWNER' || transferringOwnership.value) return
  if (
    !window.confirm(
      `${member.user.name}님에게 소유권을 위임하시겠습니까? 위임 후에는 관리자 권한으로 변경됩니다.`,
    )
  ) {
    return
  }

  transferringOwnership.value = member.user_id
  memberError.value = ''
  memberSuccess.value = ''
  try {
    const updated = await WorkspaceAPI.transferOwnership(props.workspaceId, member.user_id)
    emit('workspaceUpdated', updated)
    memberSuccess.value = `${member.user.name}님에게 소유권을 위임했습니다.`
  } catch (caught) {
    memberError.value = caught instanceof Error ? caught.message : '소유권을 위임하지 못했습니다.'
  } finally {
    transferringOwnership.value = null
  }
}
</script>

<template>
  <div class="modal-overlay bg-black/40" @click.self="$emit('close')">
    <div class="modal w-120 overflow-y-auto p-6 flex flex-col gap-5">
      <div class="modal-header items-start pb-4 border-b border-gray-200">
        <div>
          <h2 class="modal-title text-gray-900">팀원 관리</h2>
          <p class="modal-subtitle mt-0.5 text-gray-500">{{ workspaceName }} · 초대 및 구성원</p>
        </div>
        <button class="close-btn text-base p-1" @click="$emit('close')">✕</button>
      </div>

      <div class="section">
        <p class="section-label font-semibold text-gray-700 mb-2">이메일로 초대</p>
        <div class="invite-row flex gap-2 mb-2.5">
          <input
            v-model="inviteEmail"
            class="flex-1 py-2.5 px-3 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400"
            type="email"
            autocomplete="email"
            placeholder="이메일 주소 입력..."
            required
            @keyup.enter="sendInvite"
          />
          <select
            v-model="inviteRole"
            class="py-2.5 px-3.5 border border-gray-200 rounded-lg text-sm text-gray-700 bg-white cursor-pointer whitespace-nowrap"
          >
            <option v-for="r in assignableRoles" :key="r.value" :value="r.value">
              {{ r.label }}
            </option>
          </select>
        </div>
        <button
          class="send-btn w-full p-3 bg-blue-600 text-white border-none rounded-lg text-sm font-semibold cursor-pointer disabled:cursor-default disabled:opacity-55"
          :disabled="sending || !inviteEmail.trim()"
          @click="sendInvite"
        >
          {{ sending ? '전송 중...' : '초대 메일 보내기' }}
        </button>
        <p v-if="inviteError" class="error-text mt-2 text-red-600">{{ inviteError }}</p>
        <p v-if="inviteSuccess" class="success-text mt-2 text-emerald-700" role="status">
          {{ inviteSuccess }}
        </p>
      </div>

      <div class="section">
        <p class="section-label font-semibold text-gray-700 mb-2">현재 팀원</p>
        <p v-if="memberError" class="error-text mt-2 text-red-600">{{ memberError }}</p>
        <p v-if="memberSuccess" class="success-text mt-2 text-emerald-700" role="status">
          {{ memberSuccess }}
        </p>
        <ul class="member-list list-none flex flex-col gap-0.5">
          <li
            v-for="m in props.workspace.members"
            :key="m.user_id"
            class="member-item flex items-center gap-3 py-2.5 border-b border-gray-100"
          >
            <div
              class="member-avatar w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
              :style="{
                background:
                  m.role === 'OWNER' ? '#2563EB' : m.role === 'ADMIN' ? '#10B981' : '#7C3AED',
              }"
            >
              {{ m.user.name[0] }}
            </div>
            <div class="member-info flex-1">
              <p class="member-name text-sm font-medium text-gray-900">{{ m.user.name }}</p>
              <p v-if="m.user.email" class="member-email text-xs text-gray-500">
                {{ m.user.email }}
              </p>
            </div>
            <div class="member-actions flex items-center justify-end flex-wrap gap-2">
              <select
                v-if="canChangeWorkspaceMemberRole(managerRole, m.role)"
                class="member-role-select min-w-22 py-1.5 pr-7 pl-2.25 border border-gray-300 rounded-md bg-white text-gray-700 cursor-pointer focus-visible:outline-2 focus-visible:outline-blue-600 focus-visible:outline-offset-2 disabled:cursor-wait disabled:opacity-60"
                :value="m.role"
                :aria-label="`${m.user.name} 권한 변경`"
                :disabled="
                  updatingRole !== null || removing === m.user_id || transferringOwnership !== null
                "
                @change="handleRoleChange(m, $event)"
              >
                <option v-for="role in assignableRoles" :key="role.value" :value="role.value">
                  {{ role.label }}
                </option>
              </select>
              <span
                v-else
                class="role-badge py-1 px-2.5 border border-gray-200 rounded-md text-gray-700"
                >{{ roleLabels[m.role] }}</span
              >
              <span
                v-if="updatingRole === m.user_id"
                class="member-action-status text-xs text-gray-500 whitespace-nowrap"
                role="status"
              >
                저장 중...
              </span>
              <button
                v-if="managerRole === 'OWNER' && m.role !== 'OWNER'"
                type="button"
                class="transfer-btn py-1.25 px-2 border border-blue-200 rounded-md bg-blue-50 text-blue-700 text-xs font-semibold cursor-pointer whitespace-nowrap disabled:cursor-wait disabled:opacity-55"
                :disabled="
                  transferringOwnership !== null ||
                  removing === m.user_id ||
                  updatingRole === m.user_id
                "
                @click="handleOwnershipTransfer(m)"
              >
                {{ transferringOwnership === m.user_id ? '위임 중...' : '소유권 위임' }}
              </button>
              <button
                v-if="canChangeWorkspaceMemberRole(managerRole, m.role)"
                class="remove-btn bg-transparent border-none text-red-500 cursor-pointer disabled:cursor-wait disabled:opacity-55"
                :disabled="
                  removing === m.user_id ||
                  updatingRole === m.user_id ||
                  transferringOwnership !== null
                "
                @click="handleRemoveMember(m.user_id)"
              >
                {{ removing === m.user_id ? '제거 중...' : '제거' }}
              </button>
            </div>
          </li>
        </ul>
      </div>

      <div class="modal-footer border-t border-gray-200 pt-4">
        <button
          class="close-footer-btn w-full p-3 border border-gray-200 rounded-lg text-sm text-gray-700 bg-white cursor-pointer hover:bg-gray-50"
          @click="$emit('close')"
        >
          닫기
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped src="../styles/share-modal.css"></style>

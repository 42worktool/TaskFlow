<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, useId } from 'vue'
import type { Workspace, WorkspaceMember } from '../types'
import ProfileLink from './ProfileLink.vue'

// 상단바에서 팀원과 실시간 온라인 수를 빠르게 확인하고, 권한이 있으면 관리 모달로 연결한다.
// 미리보기는 온라인 사용자를 먼저 배치해 제한된 공간에서도 현재 접속자를 우선 보여준다.
const props = defineProps<{
  members: Workspace['members']
  onlineUserIds: ReadonlySet<string>
  canManage: boolean
}>()

const emit = defineEmits<{
  manage: []
}>()

const open = ref(false)
const root = ref<HTMLElement | null>(null)
const trigger = ref<HTMLButtonElement | null>(null)
const componentId = useId()
const panelId = `workspace-members-${componentId}`
const titleId = `workspace-members-title-${componentId}`

const onlineCount = computed(
  () => props.members.filter((member) => props.onlineUserIds.has(member.user_id)).length,
)

const previewMembers = computed(() =>
  [...props.members]
    .sort(
      (a, b) =>
        Number(props.onlineUserIds.has(b.user_id)) - Number(props.onlineUserIds.has(a.user_id)),
    )
    .slice(0, 4),
)

const hiddenMemberCount = computed(() =>
  Math.max(0, props.members.length - previewMembers.value.length),
)

const triggerLabel = computed(
  () => `팀원 ${props.members.length}명, 온라인 ${onlineCount.value}명 보기`,
)

function memberInitial(member: WorkspaceMember): string {
  return member.user.name.trim().charAt(0).toUpperCase() || '?'
}

function memberColor(userId: string): string {
  // 사진이 없는 사용자는 ID 기반의 안정적인 색을 사용해 렌더링마다 아바타 색이 바뀌지 않게 한다.
  const colors = ['#0c66e4', '#6554c0', '#0b875b', '#b65c02', '#ae2e24', '#227d9b']
  let hash = 0

  for (let index = 0; index < userId.length; index += 1) {
    hash = (hash * 31 + userId.charCodeAt(index)) | 0
  }

  return colors[Math.abs(hash) % colors.length]
}

function closeAndRestoreFocus(): void {
  open.value = false
  void nextTick(() => trigger.value?.focus())
}

function handleDocumentPointer(event: PointerEvent): void {
  const target = event.target
  if (target instanceof Node && !root.value?.contains(target)) open.value = false
}

function handleDocumentKeydown(event: KeyboardEvent): void {
  if (!open.value || event.key !== 'Escape') return
  event.preventDefault()
  closeAndRestoreFocus()
}

function requestManage(): void {
  open.value = false
  emit('manage')
}

onMounted(() => {
  document.addEventListener('pointerdown', handleDocumentPointer)
  document.addEventListener('keydown', handleDocumentKeydown)
})

onUnmounted(() => {
  document.removeEventListener('pointerdown', handleDocumentPointer)
  document.removeEventListener('keydown', handleDocumentKeydown)
})
</script>

<template>
  <div ref="root" class="workspace-members-menu relative inline-flex items-center shrink-0">
    <button
      ref="trigger"
      type="button"
      class="workspace-members-trigger min-h-9 inline-flex items-center gap-1.75 py-0.75 pr-2 pl-1.5 rounded-lg border border-white/18 bg-white/12 text-white hover:bg-white/22 aria-expanded:bg-white/22 focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2"
      :aria-label="triggerLabel"
      aria-haspopup="dialog"
      :aria-controls="panelId"
      :aria-expanded="open"
      @click="open = !open"
    >
      <span class="workspace-members-preview inline-flex items-center pl-1.5" aria-hidden="true">
        <span
          v-for="member in previewMembers"
          :key="member.user_id"
          class="workspace-member-preview relative w-7 h-7 -ml-1.5 rounded-full border-2"
          :title="`${member.user.name} · ${
            onlineUserIds.has(member.user_id) ? '온라인' : '오프라인'
          }`"
        >
          <img
            v-if="member.user.profile_image_url"
            :src="member.user.profile_image_url"
            alt=""
            class="workspace-member-avatar-image w-full h-full flex items-center justify-center object-cover"
            referrerpolicy="no-referrer"
          />
          <span
            v-else
            class="workspace-member-avatar-fallback w-full h-full flex items-center justify-center"
            :style="{ background: memberColor(member.user_id) }"
          >
            {{ memberInitial(member) }}
          </span>
          <span
            class="workspace-member-status-dot absolute -right-0.25 -bottom-0.25 w-2 h-2 rounded-full border-2"
            :class="{
              'workspace-member-status-dot--online': onlineUserIds.has(member.user_id),
            }"
          />
        </span>
        <span
          v-if="hiddenMemberCount"
          class="workspace-members-more w-7 h-7 -ml-1.5 inline-flex items-center justify-center rounded-full border-2"
        >
          +{{ hiddenMemberCount }}
        </span>
        <span
          v-if="members.length === 0"
          class="workspace-members-empty-icon w-7 h-7 -ml-1.5 inline-flex items-center justify-center rounded-full border-2"
          >＋</span
        >
      </span>
      <span
        class="workspace-members-trigger-count min-w-7.75 font-bold text-right whitespace-nowrap"
      >
        {{ onlineCount }}/{{ members.length }}
      </span>
    </button>

    <section
      v-if="open"
      :id="panelId"
      class="workspace-members-panel"
      role="dialog"
      aria-modal="false"
      :aria-labelledby="titleId"
    >
      <header
        class="workspace-members-panel-header min-h-14.5 flex items-center justify-between gap-3 py-2.5 pr-3 pl-4"
      >
        <div>
          <h2 :id="titleId" class="workspace-members-title text-sm">팀원</h2>
          <p class="workspace-members-summary">
            {{ members.length }}명 중 {{ onlineCount }}명 온라인
          </p>
        </div>
        <button
          type="button"
          class="workspace-members-close w-8 h-8 shrink-0 border-0 rounded-lg bg-transparent leading-none"
          aria-label="팀원 목록 닫기"
          @click="closeAndRestoreFocus"
        >
          ×
        </button>
      </header>

      <ul class="workspace-members-list min-h-0 m-0 p-1.5 overflow-y-auto list-none">
        <li
          v-if="members.length === 0"
          class="workspace-members-list-empty py-7 px-3 text-xs text-center"
        >
          아직 등록된 팀원이 없습니다.
        </li>
        <li
          v-for="member in members"
          :key="member.user_id"
          class="workspace-members-list-item min-h-12 flex items-center gap-2.5 py-1.75 px-2"
        >
          <span
            class="workspace-member-list-avatar w-8 h-8 shrink-0 rounded-full"
            aria-hidden="true"
          >
            <img
              v-if="member.user.profile_image_url"
              :src="member.user.profile_image_url"
              alt=""
              class="workspace-member-avatar-image w-full h-full flex items-center justify-center object-cover"
              referrerpolicy="no-referrer"
            />
            <span
              v-else
              class="workspace-member-avatar-fallback w-full h-full flex items-center justify-center"
              :style="{ background: memberColor(member.user_id) }"
            >
              {{ memberInitial(member) }}
            </span>
          </span>
          <span class="workspace-member-copy min-w-0 flex flex-1 flex-col">
            <ProfileLink
              :user-id="member.user_id"
              class="workspace-member-name overflow-hidden font-semibold text-ellipsis whitespace-nowrap"
            >
              {{ member.user.name }}
            </ProfileLink>
            <span class="workspace-member-role mt-0.25">{{ member.role }}</span>
          </span>
          <span
            class="workspace-member-presence inline-flex items-center gap-1.25 shrink-0"
            :class="{
              'workspace-member-presence--online': onlineUserIds.has(member.user_id),
            }"
          >
            {{ onlineUserIds.has(member.user_id) ? '온라인' : '오프라인' }}
          </span>
        </li>
      </ul>

      <footer v-if="canManage" class="workspace-members-panel-footer p-2">
        <button
          type="button"
          class="workspace-members-manage w-full py-2.25 px-3 border-0 text-white text-xs font-semibold text-center"
          @click="requestManage"
        >
          초대 및 팀원 관리
        </button>
      </footer>
    </section>
  </div>
</template>

<style scoped src="../styles/workspace-members-menu.css"></style>

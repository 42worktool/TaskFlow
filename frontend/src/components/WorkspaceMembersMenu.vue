<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, useId } from 'vue'
import type { Workspace, WorkspaceMember } from '../types'

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
        Number(props.onlineUserIds.has(b.user_id)) -
        Number(props.onlineUserIds.has(a.user_id)),
    )
    .slice(0, 4),
)

const hiddenMemberCount = computed(
  () => Math.max(0, props.members.length - previewMembers.value.length),
)

const triggerLabel = computed(
  () => `팀원 ${props.members.length}명, 온라인 ${onlineCount.value}명 보기`,
)

function memberInitial(member: WorkspaceMember): string {
  return member.user.name.trim().charAt(0).toUpperCase() || '?'
}

function memberColor(userId: string): string {
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
  <div ref="root" class="workspace-members-menu">
    <button
      ref="trigger"
      type="button"
      class="workspace-members-trigger"
      :aria-label="triggerLabel"
      aria-haspopup="dialog"
      :aria-controls="panelId"
      :aria-expanded="open"
      @click="open = !open"
    >
      <span class="workspace-members-preview" aria-hidden="true">
        <span
          v-for="member in previewMembers"
          :key="member.user_id"
          class="workspace-member-preview"
          :title="`${member.user.name} · ${
            onlineUserIds.has(member.user_id) ? '온라인' : '오프라인'
          }`"
        >
          <img
            v-if="member.user.profile_image_url"
            :src="member.user.profile_image_url"
            alt=""
            class="workspace-member-avatar-image"
            referrerpolicy="no-referrer"
          />
          <span
            v-else
            class="workspace-member-avatar-fallback"
            :style="{ background: memberColor(member.user_id) }"
          >
            {{ memberInitial(member) }}
          </span>
          <span
            class="workspace-member-status-dot"
            :class="{
              'workspace-member-status-dot--online': onlineUserIds.has(member.user_id),
            }"
          />
        </span>
        <span v-if="hiddenMemberCount" class="workspace-members-more">
          +{{ hiddenMemberCount }}
        </span>
        <span v-if="members.length === 0" class="workspace-members-empty-icon">＋</span>
      </span>
      <span class="workspace-members-trigger-count">
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
      <header class="workspace-members-panel-header">
        <div>
          <h2 :id="titleId" class="workspace-members-title">팀원</h2>
          <p class="workspace-members-summary">
            {{ members.length }}명 중 {{ onlineCount }}명 온라인
          </p>
        </div>
        <button
          type="button"
          class="workspace-members-close"
          aria-label="팀원 목록 닫기"
          @click="closeAndRestoreFocus"
        >
          ×
        </button>
      </header>

      <ul class="workspace-members-list">
        <li v-if="members.length === 0" class="workspace-members-list-empty">
          아직 등록된 팀원이 없습니다.
        </li>
        <li
          v-for="member in members"
          :key="member.user_id"
          class="workspace-members-list-item"
        >
          <span class="workspace-member-list-avatar" aria-hidden="true">
            <img
              v-if="member.user.profile_image_url"
              :src="member.user.profile_image_url"
              alt=""
              class="workspace-member-avatar-image"
              referrerpolicy="no-referrer"
            />
            <span
              v-else
              class="workspace-member-avatar-fallback"
              :style="{ background: memberColor(member.user_id) }"
            >
              {{ memberInitial(member) }}
            </span>
          </span>
          <span class="workspace-member-copy">
            <span class="workspace-member-name">{{ member.user.name }}</span>
            <span class="workspace-member-role">{{ member.role }}</span>
          </span>
          <span
            class="workspace-member-presence"
            :class="{
              'workspace-member-presence--online': onlineUserIds.has(member.user_id),
            }"
          >
            {{ onlineUserIds.has(member.user_id) ? '온라인' : '오프라인' }}
          </span>
        </li>
      </ul>

      <footer v-if="canManage" class="workspace-members-panel-footer">
        <button type="button" class="workspace-members-manage" @click="requestManage">
          초대 및 팀원 관리
        </button>
      </footer>
    </section>
  </div>
</template>

<style scoped src="../styles/workspace-members-menu.css"></style>

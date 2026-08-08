<script setup lang="ts">
import { computed } from 'vue'
import { openProfileModal } from '../services/profileModal'

// 일반 클릭은 현재 화면 위 모달로 열고, 새 탭/보조 클릭은 실제 프로필 URL의 기본 동작을 보존한다.
const props = defineProps<{
  userId: string
}>()

const href = computed(() => `/profiles/${encodeURIComponent(props.userId)}`)

function openProfile(event: MouseEvent): void {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return
  }
  event.preventDefault()
  openProfileModal(props.userId)
}
</script>

<template>
  <a :href="href" aria-haspopup="dialog" @click="openProfile"><slot /></a>
</template>

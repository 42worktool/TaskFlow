<script setup lang="ts">
import { computed } from 'vue'
import { openProfileModal } from '../services/profileModal'

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

<script setup lang="ts">
import InboxCardsPanel from './InboxCardsPanel.vue'

defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  close: []
}>()
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="drawer-backdrop" @click="emit('close')" />
    <aside class="inbox-drawer" :class="{ 'inbox-drawer--open': open }" aria-label="인박스">
      <button
        class="drawer-close-btn"
        type="button"
        aria-label="인박스 닫기"
        @click="emit('close')"
      >
        ×
      </button>
      <InboxCardsPanel v-if="open" compact />
    </aside>
  </Teleport>
</template>

<style scoped src="../styles/inbox-drawer.css"></style>

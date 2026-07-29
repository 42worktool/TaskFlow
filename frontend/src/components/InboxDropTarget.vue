<script setup lang="ts">
import { ref } from 'vue'
import draggable from 'vuedraggable'
import { InboxAPI } from '../api/inbox'
import type { Card, DraggableChange } from '../types'

const props = withDefaults(
  defineProps<{
    enabled?: boolean
    active?: boolean
  }>(),
  {
    enabled: false,
    active: false,
  },
)

const emit = defineEmits<{
  settled: [stored: boolean]
}>()

const droppedCards = ref<Card[]>([])
const busy = ref(false)

async function storeCard(event: DraggableChange<Card>): Promise<void> {
  if (!event.added || busy.value) return
  busy.value = true
  let stored = false
  try {
    await InboxAPI.moveToInbox(event.added.element.id)
    stored = true
  } catch {
    stored = false
  } finally {
    droppedCards.value = []
    busy.value = false
    emit('settled', stored)
  }
}
</script>

<template>
  <draggable
    v-model="droppedCards"
    tag="section"
    item-key="id"
    class="inbox-edge-drop-target"
    :class="{ 'inbox-edge-drop-target--active': active }"
    :group="{ name: 'board-cards', pull: false, put: enabled && !busy }"
    :disabled="!enabled || busy"
    :sort="false"
    :aria-hidden="active ? 'false' : 'true'"
    @change="storeCard"
  >
    <template #item="{ element }">
      <div class="inbox-edge-drop-card">{{ element.title }}</div>
    </template>
    <template #footer>
      <div class="inbox-edge-drop-label">
        <strong>인박스에 놓기</strong>
        <span>카드를 보드 밖에 보관합니다</span>
      </div>
    </template>
  </draggable>
</template>

<style scoped src="../styles/inbox-drop-target.css"></style>

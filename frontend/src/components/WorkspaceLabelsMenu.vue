<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, useId, watch } from 'vue'
import { LabelAPI } from '../api/label'
import type { Label } from '../types'

const props = defineProps<{
  workspaceId: string
  canManage: boolean
}>()

const emit = defineEmits<{
  changed: []
}>()

const open = ref(false)
const labels = ref<Label[]>([])
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const name = ref('')
const color = ref('#2563EB')
const editingId = ref<string | null>(null)
const editingName = ref('')
const editingColor = ref('#2563EB')
const root = ref<HTMLElement | null>(null)
const trigger = ref<HTMLButtonElement | null>(null)
const componentId = useId()
const titleId = `workspace-labels-title-${componentId}`
const panelId = `workspace-labels-panel-${componentId}`

const sortedLabels = computed(() =>
  [...labels.value].sort((a, b) => a.created_at.localeCompare(b.created_at)),
)

async function loadLabels(): Promise<void> {
  if (!props.workspaceId) return
  loading.value = true
  error.value = ''
  try {
    labels.value = await LabelAPI.list(props.workspaceId)
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : '라벨을 불러오지 못했습니다.'
  } finally {
    loading.value = false
  }
}

function resetCreateForm(): void {
  name.value = ''
  color.value = '#2563EB'
}

async function createLabel(): Promise<void> {
  const labelName = name.value.trim()
  if (!labelName || saving.value) return
  saving.value = true
  error.value = ''
  try {
    const created = await LabelAPI.create(props.workspaceId, {
      label_name: labelName,
      label_color: color.value,
    })
    labels.value = [...labels.value, created]
    resetCreateForm()
    emit('changed')
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : '라벨을 만들지 못했습니다.'
  } finally {
    saving.value = false
  }
}

function getLabelTextColor(hex: string): string {
  const normalized = hex.replace('#', '')
  if (!/^[\da-f]{6}$/i.test(normalized)) return '#111827'

  const channels = [0, 2, 4].map(
    (index) => Number.parseInt(normalized.slice(index, index + 2), 16) / 255,
  )
  const luminance = channels.reduce((total, channel, index) => {
    const linear = channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
    return total + linear * [0.2126, 0.7152, 0.0722][index]
  }, 0)

  return luminance > 0.179 ? '#111827' : '#fff'
}

function startEditing(label: Label): void {
  editingId.value = label.id
  editingName.value = label.label_name
  editingColor.value = label.label_color
}

function cancelEditing(): void {
  editingId.value = null
}

async function saveEditing(): Promise<void> {
  const labelId = editingId.value
  const labelName = editingName.value.trim()
  if (!labelId || !labelName || saving.value) return
  saving.value = true
  error.value = ''
  try {
    const updated = await LabelAPI.update(labelId, {
      label_name: labelName,
      label_color: editingColor.value,
    })
    labels.value = labels.value.map((label) => (label.id === updated.id ? updated : label))
    cancelEditing()
    emit('changed')
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : '라벨을 수정하지 못했습니다.'
  } finally {
    saving.value = false
  }
}

async function deleteLabel(label: Label): Promise<void> {
  if (saving.value || !window.confirm(`'${label.label_name}' 라벨을 삭제할까요?`)) return
  saving.value = true
  error.value = ''
  try {
    await LabelAPI.remove(label.id)
    labels.value = labels.value.filter((item) => item.id !== label.id)
    if (editingId.value === label.id) cancelEditing()
    emit('changed')
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : '라벨을 삭제하지 못했습니다.'
  } finally {
    saving.value = false
  }
}

function close(): void {
  open.value = false
  editingId.value = null
  void nextTick(() => trigger.value?.focus())
}

function handleDocumentPointer(event: PointerEvent): void {
  const target = event.target
  if (target instanceof Node && !root.value?.contains(target)) close()
}

function handleDocumentKeydown(event: KeyboardEvent): void {
  if (open.value && event.key === 'Escape') {
    event.preventDefault()
    close()
  }
}

function toggle(): void {
  open.value = !open.value
  if (open.value) void loadLabels()
}

watch(
  () => props.workspaceId,
  () => {
    labels.value = []
    if (open.value) void loadLabels()
  },
)

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
  <div ref="root" class="workspace-labels-menu">
    <button
      ref="trigger"
      type="button"
      class="workspace-labels-trigger"
      aria-haspopup="dialog"
      :aria-controls="panelId"
      :aria-expanded="open"
      @click="toggle"
    >
      <span class="mono-emoji">🏷️</span>
      <span id="aa">라벨</span>
    </button>

    <section
      v-if="open"
      :id="panelId"
      class="workspace-labels-panel"
      role="dialog"
      aria-modal="false"
      :aria-labelledby="titleId"
    >
      <header class="workspace-labels-panel-header">
        <div>
          <h2 :id="titleId">라벨</h2>
          <p>카드에 사용할 라벨을 관리하세요.</p>
        </div>
        <button
          type="button"
          class="workspace-labels-close"
          aria-label="라벨 창 닫기"
          @click="close"
        >
          ×
        </button>
      </header>

      <p v-if="error" class="workspace-labels-error" role="alert">{{ error }}</p>
      <p v-if="loading" class="workspace-labels-state" role="status">불러오는 중…</p>
      <ul v-else class="workspace-labels-list">
        <li v-for="label in sortedLabels" :key="label.id" class="workspace-labels-item">
          <template v-if="editingId === label.id">
            <input
              v-model="editingName"
              type="text"
              maxlength="50"
              aria-label="라벨 이름"
              :disabled="saving"
              @keydown.enter="saveEditing"
            />
            <input v-model="editingColor" type="color" aria-label="라벨 색상" :disabled="saving" />
            <button type="button" :disabled="saving || !editingName.trim()" @click="saveEditing">
              저장
            </button>
            <button type="button" :disabled="saving" @click="cancelEditing">취소</button>
          </template>
          <template v-else>
            <span
              class="workspace-label-chip"
              :style="{
                backgroundColor: label.label_color,
                color: getLabelTextColor(label.label_color),
              }"
              >{{ label.label_name }}</span
            >
            <button v-if="canManage" type="button" :disabled="saving" @click="startEditing(label)">
              수정
            </button>
            <button v-if="canManage" type="button" :disabled="saving" @click="deleteLabel(label)">
              삭제
            </button>
          </template>
        </li>
        <li v-if="sortedLabels.length === 0" class="workspace-labels-empty">
          아직 라벨이 없습니다.
        </li>
      </ul>

      <form v-if="canManage" class="workspace-labels-create" @submit.prevent="createLabel">
        <input
          v-model="name"
          type="text"
          maxlength="50"
          placeholder="새 라벨 이름"
          aria-label="새 라벨 이름"
          :disabled="saving"
        />
        <input v-model="color" type="color" aria-label="새 라벨 색상" :disabled="saving" />
        <button type="submit" :disabled="saving || !name.trim()">
          {{ saving ? '저장 중…' : '추가' }}
        </button>
      </form>
    </section>
  </div>
</template>

<style scoped src="../styles/workspace-labels-menu.css"></style>

<script setup lang="ts">
import { onUnmounted, ref, watch } from 'vue'
import { CardAPI } from '../api/card'
import type { Card, CardDetail } from '../types'
import {
  isDateRangeValid,
  toDateInput,
  toIsoDate,
} from '../utils/cardDates'

const props = defineProps<{ cardId: string }>()
const emit = defineEmits<{
  close: []
  saved: [card: Card]
}>()

const detail = ref<CardDetail | null>(null)
const title = ref('')
const description = ref('')
const startDate = ref('')
const deadline = ref('')
const loading = ref(true)
const saving = ref(false)
const error = ref('')
let loadGeneration = 0
let active = true
let initialTitle = ''
let initialDescription = ''
let initialStartDate = ''
let initialDeadline = ''

function close(): void {
  if (!saving.value) emit('close')
}

function applyDetail(card: CardDetail): void {
  detail.value = card
  title.value = card.title
  description.value = card.description ?? ''
  startDate.value = toDateInput(card.start_at)
  deadline.value = toDateInput(card.deadline)
  initialTitle = card.title
  initialDescription = card.description ?? ''
  initialStartDate = startDate.value
  initialDeadline = deadline.value
}

async function loadCard(): Promise<void> {
  const generation = ++loadGeneration
  detail.value = null
  loading.value = true
  error.value = ''
  try {
    const card = await CardAPI.get(props.cardId)
    if (generation === loadGeneration) applyDetail(card)
  } catch (caught) {
    if (generation === loadGeneration) {
      error.value =
        caught instanceof Error ? caught.message : '카드 상세를 불러오지 못했습니다.'
    }
  } finally {
    if (generation === loadGeneration) loading.value = false
  }
}

async function reloadAfterFailedSave(
  cardId: string,
  message: string,
): Promise<void> {
  if (!active || cardId !== props.cardId) return
  const generation = ++loadGeneration
  try {
    const card = await CardAPI.get(cardId)
    if (generation === loadGeneration && cardId === props.cardId) {
      applyDetail(card)
      emit('saved', card)
    }
  } catch {
    // Keep the original save error; a later reopen will retry the detail request.
  }
  if (generation === loadGeneration) error.value = message
}

async function submit(): Promise<void> {
  if (saving.value) return
  const cardId = props.cardId
  const trimmedTitle = title.value.trim()
  const nextDescription = description.value
  const nextStartDate = startDate.value
  const nextDeadline = deadline.value
  if (!trimmedTitle) {
    error.value = '카드 제목을 입력해 주세요.'
    return
  }
  if (!isDateRangeValid(nextStartDate, nextDeadline)) {
    error.value = '시작일은 마감일보다 늦을 수 없습니다.'
    return
  }

  const titleChanged = trimmedTitle !== initialTitle
  const descriptionChanged = nextDescription !== initialDescription
  const startDateChanged = nextStartDate !== initialStartDate
  const deadlineChanged = nextDeadline !== initialDeadline
  if (
    !titleChanged &&
    !descriptionChanged &&
    !startDateChanged &&
    !deadlineChanged
  ) {
    emit('saved', detail.value!)
    emit('close')
    return
  }

  saving.value = true
  error.value = ''
  try {
    if (titleChanged || descriptionChanged) {
      await CardAPI.update(cardId, {
        ...(titleChanged ? { title: trimmedTitle } : {}),
        ...(descriptionChanged ? { description: nextDescription } : {}),
      })
    }
    if (startDateChanged || deadlineChanged) {
      await CardAPI.updateDates(cardId, {
        // The modal deliberately uses date-only inputs. Persist the complete
        // displayed range so server validation sees the same values.
        start_at: toIsoDate(nextStartDate),
        deadline: toIsoDate(nextDeadline),
      })
    }
    const saved = await CardAPI.get(cardId)
    if (!active || cardId !== props.cardId) return
    emit('saved', saved)
    emit('close')
  } catch (caught) {
    if (!active || cardId !== props.cardId) return
    const message =
      caught instanceof Error ? caught.message : '카드를 저장하지 못했습니다.'
    await reloadAfterFailedSave(cardId, message)
  } finally {
    if (active) saving.value = false
  }
}

watch(
  () => props.cardId,
  () => {
    void loadCard()
  },
  { immediate: true },
)

onUnmounted(() => {
  active = false
  loadGeneration += 1
})
</script>

<template>
  <Teleport to="body">
    <div
      class="modal-overlay card-detail-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="card-detail-title"
      @click.self="close"
    >
      <div class="modal card-detail-modal">
        <div class="modal-header card-detail-header">
          <h2 id="card-detail-title" class="modal-title">카드 상세</h2>
          <button
            class="close-btn"
            type="button"
            aria-label="닫기"
            :disabled="saving"
            @click="close"
          >
            ✕
          </button>
        </div>

        <p v-if="loading" class="card-detail-state" role="status">카드를 불러오는 중…</p>

        <form v-else-if="detail" class="card-detail-body" @submit.prevent="submit">
          <label class="card-detail-field">
            <span>제목</span>
            <input
              v-model="title"
              type="text"
              maxlength="200"
              :disabled="saving"
              autofocus
            />
          </label>

          <label class="card-detail-field">
            <span>설명</span>
            <textarea
              v-model="description"
              rows="5"
              maxlength="5000"
              :disabled="saving"
              placeholder="카드에 필요한 내용을 기록하세요."
            />
          </label>

          <div class="card-detail-dates">
            <label class="card-detail-field">
              <span>시작일</span>
              <input
                v-model="startDate"
                type="date"
                :max="deadline || undefined"
                :disabled="saving"
              />
            </label>
            <label class="card-detail-field">
              <span>마감일</span>
              <input
                v-model="deadline"
                type="date"
                :min="startDate || undefined"
                :disabled="saving"
              />
            </label>
          </div>

          <div
            v-if="detail.members.length || detail.labels.length || detail.attachments.length"
            class="card-detail-metadata"
          >
            <div v-if="detail.members.length">
              <span class="card-detail-meta-label">담당자</span>
              <span>{{ detail.members.map((member) => member.name).join(', ') }}</span>
            </div>
            <div v-if="detail.labels.length">
              <span class="card-detail-meta-label">라벨</span>
              <span class="card-detail-labels">
                <span
                  v-for="label in detail.labels"
                  :key="label.label_id"
                  class="card-detail-label"
                  :style="{ borderColor: label.label_color, color: label.label_color }"
                >
                  {{ label.label_name }}
                </span>
              </span>
            </div>
            <div v-if="detail.attachments.length">
              <span class="card-detail-meta-label">첨부</span>
              <span>
                {{ detail.attachments.map((attachment) => attachment.file_name ?? '파일').join(', ') }}
              </span>
            </div>
          </div>

          <p v-if="error" class="card-detail-error" role="alert">{{ error }}</p>

          <div class="card-detail-actions">
            <button
              type="button"
              class="card-detail-btn card-detail-btn--secondary"
              :disabled="saving"
              @click="close"
            >
              취소
            </button>
            <button
              type="submit"
              class="card-detail-btn card-detail-btn--primary"
              :disabled="saving || !title.trim()"
            >
              {{ saving ? '저장 중…' : '저장' }}
            </button>
          </div>
        </form>

        <div v-else class="card-detail-state">
          <p role="alert">{{ error }}</p>
          <button type="button" class="card-detail-btn card-detail-btn--secondary" @click="loadCard">
            다시 시도
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped src="../styles/card-detail-modal.css"></style>

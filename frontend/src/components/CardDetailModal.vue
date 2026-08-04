<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { CardAPI } from '../api/card'
import { LabelAPI } from '../api/label'
import type { Card, CardDetail, Label } from '../types'
import {
  isDateRangeValid,
  toDateInput,
  toIsoDate,
} from '../utils/cardDates'
import { createComposerEnterSubmitter } from '../utils/composerKeyboard'

const route = useRoute()

const props = withDefaults(
  defineProps<{
    cardId: string
    editable: boolean
    refreshToken?: number
  }>(),
  { refreshToken: 0 },
)
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
const commentDraft = ref('')
const commentSaving = ref(false)
const commentError = ref('')
const availableLabels = ref<Label[]>([])
const labelsLoading = ref(false)
const labelPending = ref<string | null>(null)
const labelError = ref('')
const selectedLabelId = ref('')
const attachableLabels = computed(() => {
  const attached = new Set(detail.value?.labels.map((label) => label.label_id) ?? [])
  return availableLabels.value.filter((label) => !attached.has(label.id))
})
const error = ref('')
const remoteUpdatePending = ref(false)
let loadGeneration = 0
let commentGeneration = 0
let active = true
let initialTitle = ''
let initialDescription = ''
let initialStartDate = ''
let initialDeadline = ''

function close(): void {
  if (!saving.value && !commentSaving.value) emit('close')
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
  selectedLabelId.value = ''
  remoteUpdatePending.value = false
}

async function loadLabels(): Promise<void> {
  const workspaceId = String(route.params.workspaceId ?? '')
  if (!workspaceId) return
  labelsLoading.value = true
  labelError.value = ''
  try {
    availableLabels.value = await LabelAPI.list(workspaceId)
  } catch (caught) {
    labelError.value = caught instanceof Error ? caught.message : '라벨을 불러오지 못했습니다.'
  } finally {
    labelsLoading.value = false
  }
}

async function attachLabel(): Promise<void> {
  if (!detail.value || !selectedLabelId.value || labelPending.value) return
  const labelId = selectedLabelId.value
  if (detail.value.labels.some((label) => label.label_id === labelId)) return
  labelPending.value = labelId
  labelError.value = ''
  try {
    const label = await LabelAPI.attach(props.cardId, labelId)
    detail.value = {
      ...detail.value,
      labels: [
        ...detail.value.labels,
        {
          label_id: label.id,
          label_name: label.label_name,
          label_color: label.label_color,
        },
      ],
    }
    selectedLabelId.value = ''
  } catch (caught) {
    labelError.value = caught instanceof Error ? caught.message : '라벨을 추가하지 못했습니다.'
  } finally {
    labelPending.value = null
  }
}

async function detachLabel(labelId: string): Promise<void> {
  if (!detail.value || labelPending.value) return
  labelPending.value = labelId
  labelError.value = ''
  try {
    await LabelAPI.detach(props.cardId, labelId)
    detail.value = {
      ...detail.value,
      labels: detail.value.labels.filter((label) => label.label_id !== labelId),
    }
  } catch (caught) {
    labelError.value = caught instanceof Error ? caught.message : '라벨을 제거하지 못했습니다.'
  } finally {
    labelPending.value = null
  }
}

function hasUnsavedChanges(): boolean {
  return (
    title.value.trim() !== initialTitle ||
    description.value !== initialDescription ||
    startDate.value !== initialStartDate ||
    deadline.value !== initialDeadline
  )
}

function formatCommentTime(value: string): string {
  return new Date(value).toLocaleString('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

async function loadCard(
  options: { background?: boolean } = {},
): Promise<void> {
  const background = options.background ?? false
  const generation = ++loadGeneration
  if (!background) {
    detail.value = null
    loading.value = true
  }
  error.value = ''
  try {
    const card = await CardAPI.get(props.cardId)
    void loadLabels()
    if (generation === loadGeneration) {
      if (
        background &&
        (saving.value || (props.editable && hasUnsavedChanges()))
      ) {
        remoteUpdatePending.value = true
        return
      }
      applyDetail(card)
      if (background) emit('saved', card)
    }
  } catch (caught) {
    if (generation === loadGeneration) {
      error.value =
        caught instanceof Error ? caught.message : '카드 상세를 불러오지 못했습니다.'
    }
  } finally {
    if (!background && generation === loadGeneration) loading.value = false
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

async function submitComment(): Promise<void> {
  const cardId = props.cardId
  const nextComment = commentDraft.value.trim()
  if (!nextComment || commentSaving.value || saving.value) return

  const generation = ++commentGeneration
  commentSaving.value = true
  commentError.value = ''
  try {
    const created = await CardAPI.createComment(cardId, nextComment)
    if (
      !active ||
      generation !== commentGeneration ||
      cardId !== props.cardId ||
      !detail.value
    ) {
      return
    }

    if (!detail.value.comments.some((comment) => comment.id === created.id)) {
      detail.value = {
        ...detail.value,
        comments: [...detail.value.comments, created],
      }
    }
    commentDraft.value = ''
  } catch (caught) {
    if (
      active &&
      generation === commentGeneration &&
      cardId === props.cardId
    ) {
      commentError.value =
        caught instanceof Error
          ? caught.message
          : '댓글을 등록하지 못했습니다.'
    }
  } finally {
    if (
      active &&
      generation === commentGeneration &&
      cardId === props.cardId
    ) {
      commentSaving.value = false
    }
  }
}

const commentSubmitter = createComposerEnterSubmitter(
  () => {
    void submitComment()
  },
  (callback) => {
    void nextTick(callback)
  },
)

async function submit(): Promise<void> {
  if (!props.editable || saving.value || commentSaving.value) return
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
  if (remoteUpdatePending.value) {
    error.value =
      '다른 팀원이 이 카드를 변경했습니다. 입력 보호를 위해 닫았다가 다시 열어 주세요.'
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
    commentSubmitter.reset()
    commentGeneration += 1
    commentDraft.value = ''
    commentSaving.value = false
    commentError.value = ''
    void loadCard()
  },
  { immediate: true },
)

watch(
  () => props.refreshToken,
  (next, previous) => {
    if (next === previous) return
    if (!detail.value) {
      void loadCard()
      return
    }
    if (saving.value || (props.editable && hasUnsavedChanges())) {
      remoteUpdatePending.value = true
      return
    }
    void loadCard({ background: true })
  },
)

onUnmounted(() => {
  commentSubmitter.reset()
  active = false
  loadGeneration += 1
  commentGeneration += 1
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
            :disabled="saving || commentSaving"
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
              :readonly="!editable"
              :disabled="saving"
              :autofocus="editable"
            />
          </label>

          <label class="card-detail-field">
            <span>설명</span>
            <textarea
              v-model="description"
              rows="5"
              maxlength="5000"
              :readonly="!editable"
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
                :disabled="saving || !editable"
              />
            </label>
            <label class="card-detail-field">
              <span>마감일</span>
              <input
                v-model="deadline"
                type="date"
                :min="startDate || undefined"
                :disabled="saving || !editable"
              />
            </label>
          </div>

          <div
            v-if="detail.members.length || detail.labels.length || detail.attachments.length || editable"
            class="card-detail-metadata"
          >
            <div v-if="detail.members.length">
              <span class="card-detail-meta-label">담당자</span>
              <span>{{ detail.members.map((member) => member.name).join(', ') }}</span>
            </div>
            <div v-if="detail.labels.length || editable" class="card-detail-label-section">
              <span class="card-detail-meta-label">라벨</span>
              <span class="card-detail-labels">
                <span
                  v-for="label in detail.labels"
                  :key="label.label_id"
                  class="card-detail-label"
                  :style="{ borderColor: label.label_color, color: label.label_color }"
                >
                  {{ label.label_name }}
                  <button
                    v-if="editable"
                    type="button"
                    :disabled="labelPending !== null"
                    :aria-label="`${label.label_name} 라벨 제거`"
                    @click="detachLabel(label.label_id)"
                  >
                    ×
                  </button>
                </span>
              </span>
              <div v-if="editable" class="card-detail-label-controls">
                <select v-model="selectedLabelId" :disabled="labelsLoading || labelPending !== null">
                  <option value="">{{ attachableLabels.length ? '라벨 추가' : '라벨 없음' }}</option>
                  <option
                    v-for="label in attachableLabels"
                    :key="label.id"
                    :value="label.id"
                  >
                    {{ label.label_name }}
                  </option>
                </select>
                <button
                  type="button"
                  :disabled="!selectedLabelId || labelPending !== null"
                  @click="attachLabel"
                >
                  {{ labelPending === selectedLabelId ? '추가 중…' : '추가' }}
                </button>
              </div>
              <p v-if="labelsLoading" class="card-detail-label-state">라벨을 불러오는 중…</p>
              <p v-if="labelError" class="card-detail-label-error" role="alert">{{ labelError }}</p>
            </div>
            <div v-if="detail.attachments.length">
              <span class="card-detail-meta-label">첨부</span>
              <span>
                {{ detail.attachments.map((attachment) => attachment.file_name ?? '파일').join(', ') }}
              </span>
            </div>
          </div>

          <section class="card-detail-comments">
            <div class="card-detail-comments-heading">
              <h3>댓글</h3>
              <span>{{ detail.comments.length }}</span>
            </div>
            <div class="card-detail-comment-composer">
              <label for="card-detail-comment-input">새 댓글</label>
              <textarea
                id="card-detail-comment-input"
                v-model="commentDraft"
                rows="3"
                maxlength="2000"
                placeholder="카드에 댓글을 남기세요."
                :disabled="saving || commentSaving"
                aria-describedby="card-detail-comment-hint"
                @keydown.enter.exact="commentSubmitter.handleEnter"
                @compositionend="commentSubmitter.handleCompositionEnd"
              />
              <div class="card-detail-comment-composer-actions">
                <small id="card-detail-comment-hint">
                  Enter로 등록 · Shift+Enter로 줄바꿈
                </small>
                <button
                  type="button"
                  :disabled="saving || commentSaving || !commentDraft.trim()"
                  @click="submitComment"
                >
                  {{ commentSaving ? '등록 중…' : '댓글 등록' }}
                </button>
              </div>
              <p
                v-if="commentError"
                class="card-detail-comment-error"
                role="alert"
              >
                {{ commentError }}
              </p>
            </div>
            <p v-if="detail.comments.length === 0" class="card-detail-comments-empty">
              아직 댓글이 없습니다.
            </p>
            <article
              v-for="comment in detail.comments"
              :key="comment.id"
              class="card-detail-comment"
            >
              <img
                v-if="comment.author.profile_image_url"
                :src="comment.author.profile_image_url"
                alt=""
                referrerpolicy="no-referrer"
              />
              <span v-else class="card-detail-comment-avatar">
                {{ comment.author.name.charAt(0).toUpperCase() }}
              </span>
              <div>
                <header>
                  <strong>{{ comment.author.name }}</strong>
                  <time :datetime="comment.created_at">
                    {{ formatCommentTime(comment.created_at) }}
                  </time>
                </header>
                <p>{{ comment.comment_str }}</p>
              </div>
            </article>
          </section>

          <p v-if="error" class="card-detail-error" role="alert">{{ error }}</p>
          <p
            v-else-if="remoteUpdatePending"
            class="card-detail-error"
            role="status"
          >
            다른 팀원이 이 카드를 변경했습니다. 작성 중인 내용을 보호하기 위해
            자동으로 덮어쓰지 않았습니다.
          </p>

          <div class="card-detail-actions">
            <button
              type="button"
              class="card-detail-btn card-detail-btn--secondary"
              :disabled="saving || commentSaving"
              @click="close"
            >
              {{ editable ? '취소' : '닫기' }}
            </button>
            <button
              v-if="editable"
              type="submit"
              class="card-detail-btn card-detail-btn--primary"
              :disabled="saving || commentSaving || !title.trim()"
            >
              {{ saving ? '저장 중…' : '저장' }}
            </button>
          </div>
        </form>

        <div v-else class="card-detail-state">
          <p role="alert">{{ error }}</p>
          <button
            type="button"
            class="card-detail-btn card-detail-btn--secondary"
            @click="loadCard()"
          >
            다시 시도
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped src="../styles/card-detail-modal.css"></style>

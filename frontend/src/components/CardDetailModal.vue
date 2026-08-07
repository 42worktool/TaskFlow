<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import DatePicker from './DatePicker.vue'
import { CardAPI } from '../api/card'
import { LabelAPI } from '../api/label'
import { authState } from '../services/auth'
import type { Card, CardAttachment, CardComment, CardDetail, Label } from '../types'
import { isDateRangeValid, toDateInput, toIsoDate } from '../utils/cardDates'
import { createComposerEnterSubmitter } from '../utils/composerKeyboard'
import { ATTACHMENT_MAX_BYTES, ATTACHMENT_MIME_ALLOWLIST } from '../utils/uploadLimits'

// Derived once from the shared allowlist so the file picker's filter can't
// drift out of sync with the ATTACHMENT_MIME_ALLOWLIST.has(file.type) check below.
const attachmentAccept = [...ATTACHMENT_MIME_ALLOWLIST].join(',')

const route = useRoute()

const props = withDefaults(
  defineProps<{
    cardId: string
    editable: boolean
    canManageComments?: boolean
    refreshToken?: number
  }>(),
  { canManageComments: false, refreshToken: 0 },
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
const commentEditingId = ref<string | null>(null)
const commentEditDraft = ref('')
const commentUpdatingId = ref<string | null>(null)
const commentDeletingId = ref<string | null>(null)
const commentMutationPending = computed(
  () => commentSaving.value || commentUpdatingId.value !== null || commentDeletingId.value !== null,
)
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
const isInboxCard = computed(() => detail.value?.list_id === null)
const error = ref('')
const remoteUpdatePending = ref(false)
const attachmentInput = ref<HTMLInputElement | null>(null)
const attachmentUploading = ref(false)
const attachmentProgress = ref(0)
const attachmentError = ref('')
const attachmentPreviews = reactive<Record<string, string>>({})
const attachmentPreviewLoading = ref('')
const modal = ref<HTMLElement | null>(null)
const closeButton = ref<HTMLButtonElement | null>(null)
let loadGeneration = 0
let commentGeneration = 0
let attachmentGeneration = 0
let active = true
let initialTitle = ''
let initialDescription = ''
let initialStartDate = ''
let initialDeadline = ''
let returnFocus: HTMLElement | null = null

function focusableElements(): HTMLElement[] {
  return [
    ...(modal.value?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ) ?? []),
  ].filter((element) => element.getClientRects().length > 0)
}

function handleModalKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault()
    close()
    return
  }
  if (event.key !== 'Tab') return

  const focusable = focusableElements()
  if (focusable.length === 0) {
    event.preventDefault()
    modal.value?.focus()
    return
  }

  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

function close(): void {
  if (!saving.value && !commentMutationPending.value && !attachmentUploading.value) emit('close')
}

function isCommentAuthor(comment: CardComment): boolean {
  return comment.author.user_id === authState.user?.id
}

function canDeleteComment(comment: CardComment): boolean {
  return props.canManageComments || isCommentAuthor(comment)
}

function formatBytes(bytes: number | null): string {
  if (bytes === null) return ''
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

function isPreviewable(attachment: CardAttachment): boolean {
  return Boolean(attachment.mime_type?.startsWith('image/'))
}

function revokeAttachmentPreviews(): void {
  for (const url of Object.values(attachmentPreviews)) URL.revokeObjectURL(url)
  for (const key of Object.keys(attachmentPreviews)) delete attachmentPreviews[key]
}

function triggerAttachmentPicker(): void {
  attachmentInput.value?.click()
}

async function togglePreview(attachment: CardAttachment): Promise<void> {
  if (attachmentPreviews[attachment.id]) {
    URL.revokeObjectURL(attachmentPreviews[attachment.id])
    delete attachmentPreviews[attachment.id]
    return
  }
  if (!attachment.file_url || attachmentPreviewLoading.value) return
  attachmentPreviewLoading.value = attachment.id
  try {
    const blob = await CardAPI.fetchAttachmentBlob(attachment.id)
    attachmentPreviews[attachment.id] = URL.createObjectURL(blob)
  } catch {
    attachmentError.value = '미리보기를 불러오지 못했습니다.'
  } finally {
    attachmentPreviewLoading.value = ''
  }
}

async function onAttachmentSelected(event: Event): Promise<void> {
  const cardId = props.cardId
  const input = event.target as HTMLInputElement
  const file = input.files?.[0] ?? null
  input.value = ''
  if (!file || !detail.value || !props.editable) return

  attachmentError.value = ''
  if (file.size > ATTACHMENT_MAX_BYTES) {
    attachmentError.value = '파일 용량은 10MB를 넘을 수 없습니다.'
    return
  }
  if (!ATTACHMENT_MIME_ALLOWLIST.has(file.type)) {
    attachmentError.value = '지원하지 않는 파일 형식입니다.'
    return
  }

  const generation = ++attachmentGeneration
  attachmentUploading.value = true
  attachmentProgress.value = 0
  try {
    const created = await CardAPI.uploadAttachment(cardId, file, (percent) => {
      if (generation === attachmentGeneration) attachmentProgress.value = percent
    })
    if (
      !active ||
      generation !== attachmentGeneration ||
      cardId !== props.cardId ||
      !detail.value
    ) {
      return
    }
    detail.value = {
      ...detail.value,
      attachments: [...detail.value.attachments, created],
    }
  } catch (caught) {
    if (active && generation === attachmentGeneration && cardId === props.cardId) {
      attachmentError.value =
        caught instanceof Error ? caught.message : '파일을 업로드하지 못했습니다.'
    }
  } finally {
    if (active && generation === attachmentGeneration && cardId === props.cardId) {
      attachmentUploading.value = false
    }
  }
}

async function removeAttachmentItem(attachment: CardAttachment): Promise<void> {
  if (!detail.value || attachmentUploading.value || !props.editable) return
  const cardId = props.cardId
  const previousAttachments = detail.value.attachments
  detail.value = {
    ...detail.value,
    attachments: previousAttachments.filter((item) => item.id !== attachment.id),
  }
  if (attachmentPreviews[attachment.id]) {
    URL.revokeObjectURL(attachmentPreviews[attachment.id])
    delete attachmentPreviews[attachment.id]
  }
  try {
    await CardAPI.removeAttachment(attachment.id)
  } catch (caught) {
    if (!active || cardId !== props.cardId || !detail.value) return
    detail.value = { ...detail.value, attachments: previousAttachments }
    attachmentError.value =
      caught instanceof Error ? caught.message : '첨부파일을 삭제하지 못했습니다.'
  }
}

async function downloadAttachmentItem(attachment: CardAttachment): Promise<void> {
  try {
    await CardAPI.downloadAttachment(attachment.id, attachment.file_name ?? '파일')
  } catch (caught) {
    attachmentError.value =
      caught instanceof Error ? caught.message : '파일을 다운로드하지 못했습니다.'
  }
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

function discardCommentEditor(): void {
  commentEditSubmitter.reset()
  commentEditingId.value = null
  commentEditDraft.value = ''
}

async function loadCard(options: { background?: boolean } = {}): Promise<void> {
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
      if (background && (saving.value || (props.editable && hasUnsavedChanges()))) {
        remoteUpdatePending.value = true
        return
      }
      const editedCommentId = commentEditingId.value
      applyDetail(card)
      if (editedCommentId && !card.comments.some((comment) => comment.id === editedCommentId)) {
        discardCommentEditor()
        commentError.value = '이 댓글은 삭제되었습니다.'
      }
      if (background) emit('saved', card)
    }
  } catch (caught) {
    if (generation === loadGeneration) {
      error.value = caught instanceof Error ? caught.message : '카드 상세를 불러오지 못했습니다.'
    }
  } finally {
    if (!background && generation === loadGeneration) loading.value = false
  }
}

async function reloadAfterFailedSave(cardId: string, message: string): Promise<void> {
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
  if (!nextComment || commentMutationPending.value || saving.value) return

  const generation = ++commentGeneration
  commentSaving.value = true
  commentError.value = ''
  try {
    const created = await CardAPI.createComment(cardId, nextComment)
    if (!active || generation !== commentGeneration || cardId !== props.cardId || !detail.value) {
      return
    }

    loadGeneration += 1
    if (!detail.value.comments.some((comment) => comment.id === created.id)) {
      detail.value = {
        ...detail.value,
        comments: [...detail.value.comments, created],
      }
    }
    commentDraft.value = ''
  } catch (caught) {
    if (active && generation === commentGeneration && cardId === props.cardId) {
      commentError.value = caught instanceof Error ? caught.message : '댓글을 등록하지 못했습니다.'
    }
  } finally {
    if (active && generation === commentGeneration && cardId === props.cardId) {
      commentSaving.value = false
    }
  }
}

function startEditingComment(comment: CardComment): void {
  if (!isCommentAuthor(comment) || commentMutationPending.value) return
  commentEditSubmitter.reset()
  commentEditingId.value = comment.id
  commentEditDraft.value = comment.comment_str
  commentError.value = ''
}

function cancelEditingComment(): void {
  if (!commentUpdatingId.value) discardCommentEditor()
}

async function updateComment(comment: CardComment): Promise<void> {
  const cardId = props.cardId
  const nextComment = commentEditDraft.value.trim()
  if (
    !isCommentAuthor(comment) ||
    commentEditingId.value !== comment.id ||
    commentMutationPending.value
  ) {
    return
  }
  if (!nextComment) {
    commentError.value = '댓글 내용을 입력해 주세요.'
    return
  }
  if (nextComment === comment.comment_str) {
    cancelEditingComment()
    return
  }

  const generation = ++commentGeneration
  commentUpdatingId.value = comment.id
  commentError.value = ''
  try {
    const updated = await CardAPI.updateComment(comment.id, nextComment)
    if (!active || generation !== commentGeneration || cardId !== props.cardId || !detail.value) {
      return
    }
    loadGeneration += 1
    detail.value = {
      ...detail.value,
      comments: detail.value.comments.map((item) => (item.id === updated.id ? updated : item)),
    }
    discardCommentEditor()
  } catch (caught) {
    if (active && generation === commentGeneration && cardId === props.cardId) {
      commentError.value = caught instanceof Error ? caught.message : '댓글을 수정하지 못했습니다.'
      if (caught instanceof Error && caught.cause === 'COMMENT_ALREADY_DELETED') {
        loadGeneration += 1
        detail.value = detail.value
          ? {
              ...detail.value,
              comments: detail.value.comments.filter((item) => item.id !== comment.id),
            }
          : null
        discardCommentEditor()
      }
    }
  } finally {
    if (active && generation === commentGeneration && cardId === props.cardId) {
      commentUpdatingId.value = null
    }
  }
}

async function removeComment(comment: CardComment): Promise<void> {
  const cardId = props.cardId
  if (
    !canDeleteComment(comment) ||
    commentMutationPending.value ||
    !window.confirm('이 댓글을 삭제할까요?')
  ) {
    return
  }

  const generation = ++commentGeneration
  commentDeletingId.value = comment.id
  commentError.value = ''
  try {
    await CardAPI.removeComment(comment.id)
    if (!active || generation !== commentGeneration || cardId !== props.cardId || !detail.value) {
      return
    }
    loadGeneration += 1
    detail.value = {
      ...detail.value,
      comments: detail.value.comments.filter((item) => item.id !== comment.id),
    }
    if (commentEditingId.value === comment.id) discardCommentEditor()
  } catch (caught) {
    if (active && generation === commentGeneration && cardId === props.cardId) {
      commentError.value = caught instanceof Error ? caught.message : '댓글을 삭제하지 못했습니다.'
      if (caught instanceof Error && caught.cause === 'COMMENT_ALREADY_DELETED') {
        loadGeneration += 1
        detail.value = detail.value
          ? {
              ...detail.value,
              comments: detail.value.comments.filter((item) => item.id !== comment.id),
            }
          : null
        if (commentEditingId.value === comment.id) discardCommentEditor()
      }
    }
  } finally {
    if (active && generation === commentGeneration && cardId === props.cardId) {
      commentDeletingId.value = null
    }
  }
}

const deferComposerSubmit = (callback: () => void): void => void nextTick(callback)

const commentSubmitter = createComposerEnterSubmitter(() => {
  void submitComment()
}, deferComposerSubmit)

const commentEditSubmitter = createComposerEnterSubmitter(() => {
  const comment = detail.value?.comments.find((item) => item.id === commentEditingId.value)
  if (comment) void updateComment(comment)
}, deferComposerSubmit)

async function submit(): Promise<void> {
  if (!props.editable || saving.value || commentMutationPending.value) return
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
    error.value = '다른 팀원이 이 카드를 변경했습니다. 입력 보호를 위해 닫았다가 다시 열어 주세요.'
    return
  }

  const titleChanged = trimmedTitle !== initialTitle
  const descriptionChanged = nextDescription !== initialDescription
  const startDateChanged = nextStartDate !== initialStartDate
  const deadlineChanged = nextDeadline !== initialDeadline
  if (!titleChanged && !descriptionChanged && !startDateChanged && !deadlineChanged) {
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
    const message = caught instanceof Error ? caught.message : '카드를 저장하지 못했습니다.'
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
    discardCommentEditor()
    commentUpdatingId.value = null
    commentDeletingId.value = null
    commentError.value = ''
    attachmentGeneration += 1
    attachmentUploading.value = false
    attachmentProgress.value = 0
    attachmentError.value = ''
    revokeAttachmentPreviews()
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

onMounted(() => {
  returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
  void nextTick(() => closeButton.value?.focus())
})

onUnmounted(() => {
  commentSubmitter.reset()
  commentEditSubmitter.reset()
  active = false
  loadGeneration += 1
  commentGeneration += 1
  attachmentGeneration += 1
  revokeAttachmentPreviews()
  if (returnFocus?.isConnected) returnFocus.focus()
})
</script>

<template>
  <Teleport to="body">
    <div class="modal-overlay card-detail-overlay" @click.self="close">
      <div
        ref="modal"
        class="modal card-detail-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="card-detail-title"
        tabindex="-1"
        @keydown="handleModalKeydown"
      >
        <div class="modal-header card-detail-header">
          <h2 id="card-detail-title" class="modal-title">카드 상세</h2>
          <button
            ref="closeButton"
            class="close-btn"
            type="button"
            aria-label="닫기"
            :disabled="saving || commentMutationPending || attachmentUploading"
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
            <DatePicker
              v-model="startDate"
              label="시작일"
              :max="deadline || undefined"
              :disabled="saving || !editable"
            />
            <DatePicker
              v-model="deadline"
              label="마감일"
              align="end"
              :min="startDate || undefined"
              :disabled="saving || !editable"
            />
          </div>

          <div
            v-if="detail.labels.length || detail.attachments.length || editable"
            class="card-detail-metadata"
          >
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
                    :disabled="labelPending !== null || isInboxCard"
                    :aria-label="`${label.label_name} 라벨 제거`"
                    @click="detachLabel(label.label_id)"
                  >
                    ×
                  </button>
                </span>
              </span>
              <div v-if="editable" class="card-detail-label-controls">
                <select
                  v-model="selectedLabelId"
                  :disabled="labelsLoading || labelPending !== null || isInboxCard"
                >
                  <option value="">
                    {{ attachableLabels.length ? '라벨 추가' : '라벨 없음' }}
                  </option>
                  <option v-for="label in attachableLabels" :key="label.id" :value="label.id">
                    {{ label.label_name }}
                  </option>
                </select>
                <button
                  type="button"
                  :disabled="!selectedLabelId || labelPending !== null || isInboxCard"
                  @click="attachLabel"
                >
                  {{ labelPending === selectedLabelId ? '추가 중…' : '추가' }}
                </button>
              </div>
              <p v-if="editable && isInboxCard" class="card-detail-label-state">
                인박스 카드에는 라벨을 추가할 수 없습니다.
              </p>
              <p v-if="labelsLoading" class="card-detail-label-state">라벨을 불러오는 중…</p>
              <p v-if="labelError" class="card-detail-label-error" role="alert">{{ labelError }}</p>
            </div>
          </div>

          <section class="card-detail-attachments">
            <div class="card-detail-comments-heading">
              <h3>첨부파일</h3>
              <span>{{ detail.attachments.length }}</span>
            </div>

            <input
              v-if="editable"
              ref="attachmentInput"
              type="file"
              class="card-detail-attachment-input"
              :accept="attachmentAccept"
              @change="onAttachmentSelected"
            />
            <button
              v-if="editable"
              type="button"
              class="card-detail-btn card-detail-btn--secondary card-detail-attachment-add"
              :disabled="attachmentUploading"
              @click="triggerAttachmentPicker"
            >
              {{ attachmentUploading ? `업로드 중… ${attachmentProgress}%` : '파일 첨부' }}
            </button>
            <progress
              v-if="editable && attachmentUploading"
              class="card-detail-attachment-progress"
              :value="attachmentProgress"
              max="100"
            />
            <p v-if="attachmentError" class="card-detail-comment-error" role="alert">
              {{ attachmentError }}
            </p>

            <p v-if="detail.attachments.length === 0" class="card-detail-comments-empty">
              첨부된 파일이 없습니다.
            </p>
            <div
              v-for="attachment in detail.attachments"
              :key="attachment.id"
              class="card-detail-attachment"
            >
              <div class="card-detail-attachment-row">
                <div class="card-detail-attachment-info">
                  <strong>{{ attachment.file_name ?? '파일' }}</strong>
                  <span>{{ formatBytes(attachment.size_bytes) }}</span>
                </div>
                <div class="card-detail-attachment-actions">
                  <button
                    v-if="isPreviewable(attachment)"
                    type="button"
                    class="card-detail-attachment-link"
                    :disabled="attachmentPreviewLoading === attachment.id"
                    @click="togglePreview(attachment)"
                  >
                    {{ attachmentPreviews[attachment.id] ? '미리보기 닫기' : '미리보기' }}
                  </button>
                  <button
                    type="button"
                    class="card-detail-attachment-link"
                    @click="downloadAttachmentItem(attachment)"
                  >
                    다운로드
                  </button>
                  <button
                    v-if="editable"
                    type="button"
                    class="card-detail-attachment-link card-detail-attachment-link--danger"
                    @click="removeAttachmentItem(attachment)"
                  >
                    삭제
                  </button>
                </div>
              </div>
              <img
                v-if="attachmentPreviews[attachment.id]"
                :src="attachmentPreviews[attachment.id]"
                alt=""
                class="card-detail-attachment-preview"
              />
            </div>
          </section>

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
                :disabled="saving || commentMutationPending || attachmentUploading"
                aria-describedby="card-detail-comment-hint"
                @keydown.enter.exact="commentSubmitter.handleEnter"
                @compositionend="commentSubmitter.handleCompositionEnd"
              />
              <div class="card-detail-comment-composer-actions">
                <small id="card-detail-comment-hint"> Enter로 등록 · Shift+Enter로 줄바꿈 </small>
                <button
                  type="button"
                  :disabled="saving || commentMutationPending || !commentDraft.trim()"
                  @click="submitComment"
                >
                  {{ commentSaving ? '등록 중…' : '댓글 등록' }}
                </button>
              </div>
              <p v-if="commentError" class="card-detail-comment-error" role="alert">
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
                  <time
                    v-if="comment.updated_at !== comment.created_at"
                    class="card-detail-comment-edited"
                    :datetime="comment.updated_at"
                  >
                    수정 {{ formatCommentTime(comment.updated_at) }}
                  </time>
                  <button
                    v-if="isCommentAuthor(comment)"
                    type="button"
                    class="card-detail-comment-edit"
                    :disabled="commentMutationPending"
                    :aria-label="`${comment.author.name}님의 댓글 수정`"
                    @click="startEditingComment(comment)"
                  >
                    수정
                  </button>
                  <button
                    v-if="canDeleteComment(comment)"
                    type="button"
                    class="card-detail-comment-delete"
                    :disabled="commentMutationPending"
                    :aria-label="`${comment.author.name}님의 댓글 삭제`"
                    @click="removeComment(comment)"
                  >
                    {{ commentDeletingId === comment.id ? '삭제 중…' : '삭제' }}
                  </button>
                </header>
                <div v-if="commentEditingId === comment.id" class="card-detail-comment-editor">
                  <textarea
                    v-model="commentEditDraft"
                    rows="3"
                    maxlength="2000"
                    :disabled="commentUpdatingId === comment.id"
                    :aria-label="`${comment.author.name}님의 댓글 내용 수정`"
                    :aria-describedby="`comment-edit-hint-${comment.id}`"
                    @keydown.enter.exact="commentEditSubmitter.handleEnter"
                    @compositionend="commentEditSubmitter.handleCompositionEnd"
                  />
                  <div class="card-detail-comment-editor-actions">
                    <small :id="`comment-edit-hint-${comment.id}`">
                      Enter로 저장 · Shift+Enter로 줄바꿈
                    </small>
                    <div class="card-detail-comment-editor-buttons">
                      <button
                        type="button"
                        :disabled="commentUpdatingId !== null"
                        @click="cancelEditingComment"
                      >
                        취소
                      </button>
                      <button
                        type="button"
                        :disabled="commentUpdatingId !== null || !commentEditDraft.trim()"
                        @click="updateComment(comment)"
                      >
                        {{ commentUpdatingId === comment.id ? '저장 중…' : '저장' }}
                      </button>
                    </div>
                  </div>
                </div>
                <p v-else>{{ comment.comment_str }}</p>
              </div>
            </article>
          </section>

          <p v-if="error" class="card-detail-error" role="alert">{{ error }}</p>
          <p v-else-if="remoteUpdatePending" class="card-detail-error" role="status">
            다른 팀원이 이 카드를 변경했습니다. 작성 중인 내용을 보호하기 위해 자동으로 덮어쓰지
            않았습니다.
          </p>

          <div class="card-detail-actions">
            <button
              type="button"
              class="card-detail-btn card-detail-btn--secondary"
              :disabled="saving || commentMutationPending || attachmentUploading"
              @click="close"
            >
              {{ editable ? '취소' : '닫기' }}
            </button>
            <button
              v-if="editable"
              type="submit"
              class="card-detail-btn card-detail-btn--primary"
              :disabled="saving || commentMutationPending || !title.trim()"
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

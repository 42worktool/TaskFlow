<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { FriendAPI } from '../api/friend'
import { ProfileAPI, type PublicProfile } from '../api/profile'
import { authState } from '../services/auth'
import { profileModalState } from '../services/profileModal'
import type { Friend, FriendRequest } from '../types'
import { resolveFriendRelationship } from '../utils/friendRelationship'
import AccountLink from './AccountLink.vue'

// 공개 프로필을 독립 모달로 보여주고 로그인 사용자의 친구 관계에 맞는 요청 행동을 함께 제공한다.
// 프로필과 친구 관계 목록 조회는 세대 번호로 보호해 빠른 사용자 전환 뒤의 조회 응답을 차단한다.
const route = useRoute()
const props = defineProps<{
  userId: string
}>()
const emit = defineEmits<{
  close: []
}>()
const profile = ref<PublicProfile | null>(null)
const loading = ref(true)
const error = ref('')
const friends = ref<Friend[]>([])
const incomingRequests = ref<FriendRequest[]>([])
const outgoingRequests = ref<FriendRequest[]>([])
const relationshipLoading = ref(false)
const relationshipBusy = ref<'send' | 'accept' | 'cancel' | null>(null)
const relationshipMessage = ref('')
const relationshipError = ref('')
let loadGeneration = 0

const isOwnProfile = computed(() =>
  Boolean(profile.value && authState.user?.id === profile.value.id),
)

const relationship = computed(() =>
  profile.value
    ? resolveFriendRelationship(
        profile.value.id,
        authState.user?.id,
        friends.value,
        incomingRequests.value,
        outgoingRequests.value,
      )
    : 'none',
)

const joinedAt = computed(() => {
  if (!profile.value) return ''
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'long',
  }).format(new Date(profile.value.created_at))
})

const initial = computed(() => profile.value?.name.trim().charAt(0).toUpperCase() || '?')

function closeProfile(): void {
  emit('close')
}

function handleKeydown(event: KeyboardEvent): void {
  // 프로필 위에 계정 편집 화면이 겹친 경우에는 Escape를 상위 표면이 먼저 처리하게 둔다.
  if (event.key !== 'Escape') return
  if (profileModalState.surface && profileModalState.surface !== 'profile') return
  event.preventDefault()
  event.stopImmediatePropagation()
  closeProfile()
}

function resetRelationship(): void {
  friends.value = []
  incomingRequests.value = []
  outgoingRequests.value = []
  relationshipMessage.value = ''
  relationshipError.value = ''
  relationshipLoading.value = false
  relationshipBusy.value = null
}

async function loadRelationship(generation: number): Promise<void> {
  // 본인 프로필에는 친구 API가 필요 없고, 타인일 때만 목록과 요청 양쪽을 조합해 관계를 판정한다.
  if (!profile.value || !authState.user || isOwnProfile.value) return

  relationshipLoading.value = true
  try {
    const [loadedFriends, loadedRequests] = await Promise.all([
      FriendAPI.list(),
      FriendAPI.listRequests(),
    ])
    if (generation !== loadGeneration) return
    friends.value = loadedFriends
    incomingRequests.value = loadedRequests.incoming
    outgoingRequests.value = loadedRequests.outgoing
  } catch (caught) {
    if (generation !== loadGeneration) return
    relationshipError.value =
      caught instanceof Error ? caught.message : '친구 상태를 불러오지 못했습니다.'
  } finally {
    if (generation === loadGeneration) relationshipLoading.value = false
  }
}

function retryRelationship(): void {
  relationshipError.value = ''
  void loadRelationship(loadGeneration)
}

async function loadProfile(userId: string): Promise<void> {
  const generation = ++loadGeneration
  loading.value = true
  error.value = ''
  profile.value = null
  resetRelationship()
  try {
    const loadedProfile = await ProfileAPI.get(userId)
    if (generation !== loadGeneration) return
    profile.value = loadedProfile
    void loadRelationship(generation)
  } catch (caught) {
    if (generation !== loadGeneration) return
    error.value = caught instanceof Error ? caught.message : '프로필을 불러오지 못했습니다.'
  } finally {
    if (generation === loadGeneration) loading.value = false
  }
}

async function sendFriendRequest(): Promise<void> {
  if (!profile.value || relationshipBusy.value) return

  relationshipBusy.value = 'send'
  relationshipMessage.value = ''
  relationshipError.value = ''
  try {
    const request = await FriendAPI.sendRequestToUser(profile.value.id)
    outgoingRequests.value = [
      request,
      ...outgoingRequests.value.filter((item) => item.id !== request.id),
    ]
    relationshipMessage.value = '친구 요청을 보냈습니다.'
  } catch (caught) {
    relationshipError.value =
      caught instanceof Error ? caught.message : '친구 요청을 보내지 못했습니다.'
  } finally {
    relationshipBusy.value = null
  }
}

async function acceptFriendRequest(): Promise<void> {
  const request = incomingRequests.value.find((item) => item.id === profile.value?.id)
  if (!request || relationshipBusy.value) return

  relationshipBusy.value = 'accept'
  relationshipMessage.value = ''
  relationshipError.value = ''
  try {
    const friend = await FriendAPI.acceptRequest(request.id)
    friends.value = [friend, ...friends.value.filter((item) => item.id !== friend.id)]
    incomingRequests.value = incomingRequests.value.filter((item) => item.id !== request.id)
    relationshipMessage.value = '친구 요청을 수락했습니다.'
  } catch (caught) {
    relationshipError.value =
      caught instanceof Error ? caught.message : '친구 요청을 수락하지 못했습니다.'
  } finally {
    relationshipBusy.value = null
  }
}

async function cancelFriendRequest(): Promise<void> {
  const request = outgoingRequests.value.find((item) => item.id === profile.value?.id)
  if (!request || relationshipBusy.value) return

  relationshipBusy.value = 'cancel'
  relationshipMessage.value = ''
  relationshipError.value = ''
  try {
    await FriendAPI.deleteRequest(request.id)
    outgoingRequests.value = outgoingRequests.value.filter((item) => item.id !== request.id)
    relationshipMessage.value = '친구 요청을 취소했습니다.'
  } catch (caught) {
    relationshipError.value =
      caught instanceof Error ? caught.message : '친구 요청을 취소하지 못했습니다.'
  } finally {
    relationshipBusy.value = null
  }
}

watch([() => props.userId, () => authState.user?.id], ([userId]) => void loadProfile(userId), {
  immediate: true,
})

onMounted(() => window.addEventListener('keydown', handleKeydown, true))
onBeforeUnmount(() => window.removeEventListener('keydown', handleKeydown, true))
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-[420] flex items-center justify-center bg-[rgba(17,24,39,0.28)] p-5! backdrop-blur-[2px]"
      @click.self="closeProfile"
    >
      <main
        class="m-0 max-h-[calc(100vh-40px)] w-full max-w-[860px] overflow-y-auto rounded-xl"
        @click.self="closeProfile"
      >
        <div
          v-if="loading"
          class="grid min-h-60 place-content-center gap-2 rounded-xl border border-[#dfe3eb] bg-white p-10! text-center text-[#626f86] shadow-[0_16px_48px_rgba(17,24,39,0.22)]"
          role="status"
        >
          프로필을 불러오는 중…
        </div>
        <div
          v-else-if="error"
          class="grid min-h-60 place-content-center gap-2 rounded-xl border border-[#dfe3eb] bg-white p-10! text-center text-[#626f86] shadow-[0_16px_48px_rgba(17,24,39,0.22)]"
          role="alert"
        >
          <strong class="text-[#ae2a19]">프로필을 표시할 수 없습니다.</strong>
          <span>{{ error }}</span>
        </div>

        <article
          v-else-if="profile"
          class="rounded-xl border border-[#dfe3eb] bg-white shadow-[0_16px_48px_rgba(17,24,39,0.22)]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="profile-name"
        >
          <div class="flex items-center justify-between px-6! pt-5!">
            <h2 class="text-lg font-bold">프로필</h2>
            <button
              type="button"
              class="border-0 bg-transparent p-0! text-sm text-gray-500"
              aria-label="프로필 닫기"
              @click="closeProfile"
            >
              ✕
            </button>
          </div>

          <header
            class="relative mt-5! flex items-center gap-6 border-b border-[#e9ebf0] bg-[linear-gradient(135deg,#f8fbff_0%,#eef4ff_100%)] p-10! max-sm:flex-col max-sm:items-start max-sm:px-6! max-sm:py-7!"
          >
            <img
              v-if="profile.profile_image_url"
              :src="profile.profile_image_url"
              :alt="`${profile.name} 프로필 사진`"
              class="size-[116px] shrink-0 rounded-full border-4 border-white object-cover shadow-[0_10px_26px_rgba(9,30,66,0.16)] max-sm:size-[92px]"
              referrerpolicy="no-referrer"
            />
            <div
              v-else
              class="grid size-[116px] shrink-0 place-items-center rounded-full border-4 border-white bg-[linear-gradient(145deg,#0c66e4,#1a3a6b)] text-[38px] font-extrabold text-white shadow-[0_10px_26px_rgba(9,30,66,0.16)] max-sm:size-[92px]"
              aria-hidden="true"
            >
              {{ initial }}
            </div>

            <div class="min-w-0">
              <p class="mb-[7px]! text-[11px] font-extrabold tracking-[0.14em] text-[#0c66e4]">
                PUBLIC PROFILE
              </p>
              <h1
                id="profile-name"
                class="text-[clamp(28px,5vw,38px)] leading-[1.12] text-[#172b4d]"
              >
                {{ profile.name }}
              </h1>
              <p class="mt-2.5! text-[17px] leading-[1.5] text-[#44546f]">
                {{ profile.headline }}
              </p>
            </div>

            <div
              class="ml-auto flex flex-col items-end self-start gap-2 max-sm:mt-0.5! max-sm:ml-0 max-sm:w-full max-sm:items-stretch"
            >
              <AccountLink
                v-if="isOwnProfile"
                class="self-start whitespace-nowrap rounded-lg border border-[#0c66e4] px-3.5! py-[9px]! text-[13px] font-bold text-[#0c66e4] hover:bg-[#e9f2ff] max-sm:w-full max-sm:text-center"
              >
                프로필 편집
              </AccountLink>

              <RouterLink
                v-else-if="!authState.user"
                :to="{ path: '/signin', query: { redirect: route.fullPath } }"
                class="whitespace-nowrap rounded-lg border border-[#0c66e4] bg-[#0c66e4] px-3.5! py-[9px]! text-[13px] font-[750] text-white hover:bg-[#0055cc] max-sm:w-full max-sm:text-center"
              >
                로그인 후 친구 추가
              </RouterLink>

              <button
                v-else-if="relationshipLoading"
                type="button"
                class="whitespace-nowrap rounded-lg border border-[#0c66e4] bg-[#0c66e4] px-3.5! py-[9px]! text-[13px] font-[750] text-white disabled:cursor-wait disabled:opacity-60 max-sm:w-full max-sm:text-center"
                disabled
              >
                친구 상태 확인 중…
              </button>

              <button
                v-else-if="relationshipError"
                type="button"
                class="whitespace-nowrap rounded-lg border border-[#0c66e4] bg-[#0c66e4] px-3.5! py-[9px]! text-[13px] font-[750] text-white hover:bg-[#0055cc] max-sm:w-full max-sm:text-center"
                @click="retryRelationship"
              >
                친구 상태 다시 확인
              </button>

              <template v-else-if="relationship === 'friend'">
                <span
                  class="inline-flex min-h-9 items-center whitespace-nowrap rounded-full bg-[#dcfce7] px-[11px]! py-[7px]! text-xs font-extrabold text-[#166534]"
                >
                  ✓ 친구
                </span>
              </template>

              <button
                v-else-if="relationship === 'incoming'"
                type="button"
                class="whitespace-nowrap rounded-lg border border-[#0c66e4] bg-[#0c66e4] px-3.5! py-[9px]! text-[13px] font-[750] text-white hover:bg-[#0055cc] disabled:cursor-wait disabled:opacity-60 disabled:hover:bg-[#0c66e4] max-sm:w-full max-sm:text-center"
                :disabled="relationshipBusy !== null"
                @click="acceptFriendRequest"
              >
                {{ relationshipBusy === 'accept' ? '수락 중…' : '친구 요청 수락' }}
              </button>

              <div
                v-else-if="relationship === 'outgoing'"
                class="flex items-center gap-1.5 max-sm:justify-between"
              >
                <span
                  class="inline-flex min-h-9 items-center whitespace-nowrap rounded-full bg-[#f1f2f4] px-[11px]! py-[7px]! text-xs font-extrabold text-[#44546f]"
                >
                  요청 보냄
                </span>
                <button
                  type="button"
                  class="whitespace-nowrap rounded-lg border border-[#dfe1e6] bg-white px-2.5! py-2! text-[13px] font-[750] text-[#ae2a19] hover:bg-[#fff2f0] disabled:cursor-wait disabled:opacity-60 disabled:hover:bg-white"
                  :disabled="relationshipBusy !== null"
                  @click="cancelFriendRequest"
                >
                  {{ relationshipBusy === 'cancel' ? '취소 중…' : '요청 취소' }}
                </button>
              </div>

              <button
                v-else
                type="button"
                class="whitespace-nowrap rounded-lg border border-[#0c66e4] bg-[#0c66e4] px-3.5! py-[9px]! text-[13px] font-[750] text-white hover:bg-[#0055cc] disabled:cursor-wait disabled:opacity-60 disabled:hover:bg-[#0c66e4] max-sm:w-full max-sm:text-center"
                :disabled="relationshipBusy !== null"
                @click="sendFriendRequest"
              >
                {{ relationshipBusy === 'send' ? '요청 중…' : '+ 친구 추가' }}
              </button>

              <p
                v-if="relationshipMessage"
                class="max-w-[220px] text-right text-[11px] leading-[1.4] text-[#166534] max-sm:max-w-none max-sm:text-left"
                role="status"
              >
                {{ relationshipMessage }}
              </p>
              <p
                v-if="relationshipError"
                class="max-w-[220px] text-right text-[11px] leading-[1.4] text-[#ae2a19] max-sm:max-w-none max-sm:text-left"
                role="alert"
              >
                {{ relationshipError }}
              </p>
            </div>
          </header>

          <div
            class="grid grid-cols-2 gap-[18px] px-10! pt-8! pb-10! max-sm:grid-cols-1 max-sm:px-5! max-sm:pt-[22px]! max-sm:pb-[26px]!"
          >
            <section class="min-h-[126px] rounded-xl border border-[#e9ebf0] bg-white p-5!">
              <h2 class="mb-3! text-xs font-extrabold uppercase tracking-[0.06em] text-[#44546f]">
                소개
              </h2>
              <p class="leading-[1.6] text-[#172b4d]">{{ profile.headline }}</p>
            </section>

            <section class="min-h-[126px] rounded-xl border border-[#e9ebf0] bg-white p-5!">
              <h2 class="mb-3! text-xs font-extrabold uppercase tracking-[0.06em] text-[#44546f]">
                Professional
              </h2>
              <a
                v-if="profile.linkedin_url"
                :href="profile.linkedin_url"
                class="inline-flex rounded-lg bg-[#0a66c2] px-3! py-[9px]! font-bold text-white hover:bg-[#004182]"
                target="_blank"
                rel="noopener noreferrer"
              >
                LinkedIn 프로필 보기 ↗
              </a>
              <p v-else class="leading-[1.6] text-[#7a869a]">
                등록된 Professional SNS 링크가 없습니다.
              </p>
            </section>

            <section
              class="col-span-full min-h-[auto] rounded-xl border border-[#e9ebf0] bg-white p-5! max-sm:col-auto"
            >
              <h2 class="mb-3! text-xs font-extrabold uppercase tracking-[0.06em] text-[#44546f]">
                TaskFlow 활동
              </h2>
              <p class="leading-[1.6] text-[#172b4d]">{{ joinedAt }}부터 함께하고 있습니다.</p>
            </section>
          </div>
        </article>
      </main>
    </div>
  </Teleport>
</template>

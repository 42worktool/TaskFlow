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
    <div class="modal-overlay public-profile-overlay" @click.self="closeProfile">
      <main class="public-profile-shell public-profile-dialog-shell" @click.self="closeProfile">
        <div v-if="loading" class="public-profile-state" role="status">프로필을 불러오는 중…</div>
        <div
          v-else-if="error"
          class="public-profile-state public-profile-state--error"
          role="alert"
        >
          <strong>프로필을 표시할 수 없습니다.</strong>
          <span>{{ error }}</span>
        </div>

        <article
          v-else-if="profile"
          class="public-profile-card"
          role="dialog"
          aria-modal="true"
          aria-labelledby="profile-name"
        >
          <div class="modal-header public-profile-modal-header">
            <h2 class="modal-title">프로필</h2>
            <button type="button" class="close-btn" aria-label="프로필 닫기" @click="closeProfile">
              ✕
            </button>
          </div>

          <header class="public-profile-hero">
            <img
              v-if="profile.profile_image_url"
              :src="profile.profile_image_url"
              :alt="`${profile.name} 프로필 사진`"
              class="public-profile-avatar"
              referrerpolicy="no-referrer"
            />
            <div
              v-else
              class="public-profile-avatar public-profile-avatar--fallback"
              aria-hidden="true"
            >
              {{ initial }}
            </div>

            <div class="public-profile-identity">
              <p class="public-profile-eyebrow">PUBLIC PROFILE</p>
              <h1 id="profile-name">{{ profile.name }}</h1>
              <p class="public-profile-headline">{{ profile.headline }}</p>
            </div>

            <div class="public-profile-actions">
              <AccountLink v-if="isOwnProfile" class="public-profile-edit">
                프로필 편집
              </AccountLink>

              <RouterLink
                v-else-if="!authState.user"
                :to="{ path: '/signin', query: { redirect: route.fullPath } }"
                class="public-profile-friend-button"
              >
                로그인 후 친구 추가
              </RouterLink>

              <button
                v-else-if="relationshipLoading"
                type="button"
                class="public-profile-friend-button"
                disabled
              >
                친구 상태 확인 중…
              </button>

              <button
                v-else-if="relationshipError"
                type="button"
                class="public-profile-friend-button"
                @click="retryRelationship"
              >
                친구 상태 다시 확인
              </button>

              <template v-else-if="relationship === 'friend'">
                <span class="public-profile-relationship public-profile-relationship--friend">
                  ✓ 친구
                </span>
              </template>

              <button
                v-else-if="relationship === 'incoming'"
                type="button"
                class="public-profile-friend-button"
                :disabled="relationshipBusy !== null"
                @click="acceptFriendRequest"
              >
                {{ relationshipBusy === 'accept' ? '수락 중…' : '친구 요청 수락' }}
              </button>

              <div v-else-if="relationship === 'outgoing'" class="public-profile-outgoing">
                <span class="public-profile-relationship">요청 보냄</span>
                <button
                  type="button"
                  class="public-profile-cancel-button"
                  :disabled="relationshipBusy !== null"
                  @click="cancelFriendRequest"
                >
                  {{ relationshipBusy === 'cancel' ? '취소 중…' : '요청 취소' }}
                </button>
              </div>

              <button
                v-else
                type="button"
                class="public-profile-friend-button"
                :disabled="relationshipBusy !== null"
                @click="sendFriendRequest"
              >
                {{ relationshipBusy === 'send' ? '요청 중…' : '+ 친구 추가' }}
              </button>

              <p
                v-if="relationshipMessage"
                class="public-profile-friend-feedback public-profile-friend-feedback--success"
                role="status"
              >
                {{ relationshipMessage }}
              </p>
              <p
                v-if="relationshipError"
                class="public-profile-friend-feedback public-profile-friend-feedback--error"
                role="alert"
              >
                {{ relationshipError }}
              </p>
            </div>
          </header>

          <div class="public-profile-details">
            <section class="public-profile-section">
              <h2>소개</h2>
              <p>{{ profile.headline }}</p>
            </section>

            <section class="public-profile-section">
              <h2>Professional</h2>
              <a
                v-if="profile.linkedin_url"
                :href="profile.linkedin_url"
                class="public-profile-linkedin"
                target="_blank"
                rel="noopener noreferrer"
              >
                LinkedIn 프로필 보기 ↗
              </a>
              <p v-else class="public-profile-muted">등록된 Professional SNS 링크가 없습니다.</p>
            </section>

            <section class="public-profile-section public-profile-section--joined">
              <h2>TaskFlow 활동</h2>
              <p>{{ joinedAt }}부터 함께하고 있습니다.</p>
            </section>
          </div>
        </article>
      </main>
    </div>
  </Teleport>
</template>

<style scoped src="../styles/profile.css"></style>

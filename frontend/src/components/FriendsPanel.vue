<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { FriendAPI } from '../api/friend'
import type { PublicProfile } from '../api/profile'
import { SearchAPI } from '../api/search'
import PersonAvatar from './PersonAvatar.vue'
import { authState } from '../services/auth'
import { realtime } from '../services/realtime'
import {
  parseFriend,
  parseFriendPresenceEvent,
  parseFriendRequest,
  parseFriendUserIdEvent,
} from '../services/realtime/protocol'
import type { Friend, FriendRequest } from '../types'
import { resolveFriendRelationship } from '../utils/friendRelationship'

const emit = defineEmits<{
  changed: []
  'open-dm': [friend: Friend]
}>()

const friends = ref<Friend[]>([])
const incomingRequests = ref<FriendRequest[]>([])
const outgoingRequests = ref<FriendRequest[]>([])
const activeTab = ref<'incoming' | 'outgoing' | 'friends'>('incoming')
const friendSearchQuery = ref('')
const friendSearchResults = ref<PublicProfile[]>([])
const friendSearchLoading = ref(false)
const friendSearchError = ref('')
const loading = ref(true)
const hasLoadedData = ref(false)
const busyAction = ref<string | null>(null)
const message = ref('')
const error = ref('')

let loadGeneration = 0
let presenceSequence = 0
let reloadAfterMutation = false
let friendSearchTimer: ReturnType<typeof setTimeout> | null = null
let friendSearchVersion = 0
const livePresence = new Map<string, { online: boolean; sequence: number }>()
let removePresenceListener: (() => void) | null = null
let removeRealtimeStateListener: (() => void) | null = null
let removeRequestCreatedListener: (() => void) | null = null
let removeRequestAcceptedListener: (() => void) | null = null
let removeRequestDeletedListener: (() => void) | null = null
let removeFriendRemovedListener: (() => void) | null = null

const visibleFriendSearchResults = computed(() =>
  friendSearchResults.value.filter((person) => person.id !== authState.user?.id).slice(0, 8),
)

watch([friendSearchQuery, loading], ([value, isLoading]) => {
  const version = ++friendSearchVersion
  if (friendSearchTimer) clearTimeout(friendSearchTimer)
  friendSearchResults.value = []
  friendSearchError.value = ''
  friendSearchLoading.value = false

  const query = value.trim()
  if (!query || isLoading) return

  friendSearchLoading.value = true
  friendSearchTimer = setTimeout(async () => {
    try {
      const profiles = await SearchAPI.users(query)
      if (version !== friendSearchVersion) return
      friendSearchResults.value = profiles
    } catch {
      if (version !== friendSearchVersion) return
      friendSearchError.value = '사람을 검색하지 못했습니다.'
    } finally {
      if (version === friendSearchVersion) friendSearchLoading.value = false
    }
  }, 180)
})

function relationshipFor(userId: string) {
  return resolveFriendRelationship(
    userId,
    authState.user?.id,
    friends.value,
    incomingRequests.value,
    outgoingRequests.value,
  )
}

function incomingRequestFor(userId: string) {
  return incomingRequests.value.find((request) => request.id === userId)
}

function outgoingRequestFor(userId: string) {
  return outgoingRequests.value.find((request) => request.id === userId)
}

function friendFor(userId: string) {
  return friends.value.find((friend) => friend.id === userId)
}

function applyNewerPresence(friend: Friend, presenceAtStart: number): void {
  const live = livePresence.get(friend.id)
  if (live && live.sequence > presenceAtStart) {
    friend.online = live.online
  }
}

async function loadFriendData(options: { preserveFeedback?: boolean } = {}): Promise<void> {
  const generation = ++loadGeneration
  const presenceAtStart = presenceSequence
  loading.value = true
  if (!options.preserveFeedback) {
    message.value = ''
    error.value = ''
  }

  try {
    const [loadedFriends, loadedRequests] = await Promise.all([
      FriendAPI.list(),
      FriendAPI.listRequests(),
    ])
    if (generation !== loadGeneration) return

    loadedFriends.forEach((friend) => applyNewerPresence(friend, presenceAtStart))
    friends.value = loadedFriends
    incomingRequests.value = loadedRequests.incoming
    outgoingRequests.value = loadedRequests.outgoing
    hasLoadedData.value = true
  } catch (caught) {
    if (generation !== loadGeneration) return
    error.value = caught instanceof Error ? caught.message : '친구 정보를 불러오지 못했습니다.'
  } finally {
    if (generation === loadGeneration) loading.value = false
  }
}

function receiveFriendPresence(value: unknown): void {
  const event = parseFriendPresenceEvent(value)
  if (!event) return

  presenceSequence += 1
  livePresence.set(event.user_id, {
    online: event.online,
    sequence: presenceSequence,
  })
  const friend = friends.value.find((item) => item.id === event.user_id)
  if (friend) friend.online = event.online
}

function receiveFriendRequestCreated(value: unknown): void {
  const request = parseFriendRequest(value)
  if (!request) return
  if (incomingRequests.value.some((item) => item.id === request.id)) return
  incomingRequests.value = [request, ...incomingRequests.value]
}

function receiveFriendRequestAccepted(value: unknown): void {
  const friend = parseFriend(value)
  if (!friend) return
  outgoingRequests.value = outgoingRequests.value.filter((item) => item.id !== friend.id)
  friends.value = [friend, ...friends.value.filter((item) => item.id !== friend.id)]
}

function receiveFriendRequestDeleted(value: unknown): void {
  const event = parseFriendUserIdEvent(value)
  if (!event) return
  incomingRequests.value = incomingRequests.value.filter((item) => item.id !== event.user_id)
  outgoingRequests.value = outgoingRequests.value.filter((item) => item.id !== event.user_id)
}

function receiveFriendRemoved(value: unknown): void {
  const event = parseFriendUserIdEvent(value)
  if (!event) return
  friends.value = friends.value.filter((item) => item.id !== event.user_id)
}

function refreshAfterReconnect(): void {
  if (busyAction.value) {
    reloadAfterMutation = true
    return
  }
  void loadFriendData({ preserveFeedback: true })
}

function finishMutation(): void {
  busyAction.value = null
  if (reloadAfterMutation) {
    reloadAfterMutation = false
    void loadFriendData({ preserveFeedback: true })
  }
}

async function sendRequestToUser(person: PublicProfile): Promise<void> {
  if (busyAction.value) return

  busyAction.value = `send:${person.id}`
  message.value = ''
  error.value = ''
  try {
    const request = await FriendAPI.sendRequestToUser(person.id)
    outgoingRequests.value = [
      request,
      ...outgoingRequests.value.filter((item) => item.id !== request.id),
    ]
    message.value = `${request.name}님께 친구 요청을 보냈습니다.`
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : '친구 요청을 보내지 못했습니다.'
  } finally {
    finishMutation()
  }
}

function acceptSearchResult(userId: string): void {
  const request = incomingRequestFor(userId)
  if (request) void acceptRequest(request)
}

function cancelSearchResult(userId: string): void {
  const request = outgoingRequestFor(userId)
  if (request) void deleteRequest(request, 'outgoing')
}

function openSearchResultDm(userId: string): void {
  const friend = friendFor(userId)
  if (friend) emit('open-dm', friend)
}

async function acceptRequest(request: FriendRequest): Promise<void> {
  if (busyAction.value) return

  const presenceAtStart = presenceSequence
  busyAction.value = `accept:${request.id}`
  message.value = ''
  error.value = ''
  try {
    const friend = await FriendAPI.acceptRequest(request.id)
    applyNewerPresence(friend, presenceAtStart)
    friends.value = [friend, ...friends.value.filter((item) => item.id !== friend.id)]
    incomingRequests.value = incomingRequests.value.filter((item) => item.id !== request.id)
    message.value = `${friend.name}님과 친구가 되었습니다.`
    emit('changed')
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : '친구 요청을 수락하지 못했습니다.'
  } finally {
    finishMutation()
  }
}

async function deleteRequest(
  request: FriendRequest,
  direction: 'incoming' | 'outgoing',
): Promise<void> {
  if (busyAction.value) return

  busyAction.value = `${direction}:${request.id}`
  message.value = ''
  error.value = ''
  try {
    await FriendAPI.deleteRequest(request.id)
    if (direction === 'incoming') {
      incomingRequests.value = incomingRequests.value.filter((item) => item.id !== request.id)
      message.value = `${request.name}님의 친구 요청을 거절했습니다.`
    } else {
      outgoingRequests.value = outgoingRequests.value.filter((item) => item.id !== request.id)
      message.value = `${request.name}님에게 보낸 요청을 취소했습니다.`
    }
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : '친구 요청을 처리하지 못했습니다.'
  } finally {
    finishMutation()
  }
}

async function removeFriend(friend: Friend): Promise<void> {
  if (busyAction.value) return
  if (!window.confirm(`${friend.name}님을 친구에서 삭제하시겠습니까?`)) return

  busyAction.value = `remove:${friend.id}`
  message.value = ''
  error.value = ''
  try {
    await FriendAPI.remove(friend.id)
    friends.value = friends.value.filter((item) => item.id !== friend.id)
    message.value = `${friend.name}님을 친구 목록에서 삭제했습니다.`
    emit('changed')
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : '친구를 삭제하지 못했습니다.'
  } finally {
    finishMutation()
  }
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('ko-KR')
}

onMounted(() => {
  removePresenceListener = realtime.on('friend.presence_changed', receiveFriendPresence)
  removeRequestCreatedListener = realtime.on('friend.request_created', receiveFriendRequestCreated)
  removeRequestAcceptedListener = realtime.on(
    'friend.request_accepted',
    receiveFriendRequestAccepted,
  )
  removeRequestDeletedListener = realtime.on('friend.request_deleted', receiveFriendRequestDeleted)
  removeFriendRemovedListener = realtime.on('friend.removed', receiveFriendRemoved)
  removeRealtimeStateListener = realtime.onStateChange((state) => {
    if (state === 'connected') refreshAfterReconnect()
  })
  void loadFriendData()
})

onUnmounted(() => {
  loadGeneration += 1
  friendSearchVersion += 1
  if (friendSearchTimer) clearTimeout(friendSearchTimer)
  removePresenceListener?.()
  removeRequestCreatedListener?.()
  removeRequestAcceptedListener?.()
  removeRequestDeletedListener?.()
  removeFriendRemovedListener?.()
  removeRealtimeStateListener?.()
  livePresence.clear()
})
</script>

<template>
  <div class="friends-panel-content">
    <section class="friend-panel friend-search-panel">
      <div>
        <h2>사람 찾기</h2>
        <p>이름 또는 이메일로 친구를 찾고 요청을 보내세요.</p>
      </div>

      <label class="friend-search-field">
        <span aria-hidden="true">⌕</span>
        <input
          v-model="friendSearchQuery"
          type="search"
          autocomplete="off"
          placeholder="이름 또는 이메일로 친구 찾기"
          aria-label="이름 또는 이메일로 친구 찾기"
          :disabled="loading"
        />
        <small v-if="friendSearchLoading">검색 중…</small>
      </label>

      <p v-if="friendSearchError" class="friend-search-state" role="alert">
        {{ friendSearchError }}
      </p>
      <p
        v-else-if="
          friendSearchQuery.trim() &&
          !friendSearchLoading &&
          visibleFriendSearchResults.length === 0
        "
        class="friend-search-state"
      >
        일치하는 사용자가 없습니다.
      </p>

      <ul v-if="visibleFriendSearchResults.length" class="friend-search-results">
        <li v-for="person in visibleFriendSearchResults" :key="person.id" class="friend-search-row">
          <PersonAvatar :name="person.name" :image-url="person.profile_image_url" />
          <div class="friend-search-copy">
            <RouterLink :to="`/profiles/${person.id}`">{{ person.name }}</RouterLink>
            <span>{{ person.headline }}</span>
          </div>

          <div class="friend-search-actions">
            <template v-if="relationshipFor(person.id) === 'friend'">
              <span class="friend-relation-badge friend-relation-badge--friend">친구</span>
              <button
                type="button"
                class="text-button"
                :disabled="busyAction !== null"
                @click="openSearchResultDm(person.id)"
              >
                메시지
              </button>
            </template>
            <template v-else-if="relationshipFor(person.id) === 'incoming'">
              <span class="friend-relation-badge">요청 받음</span>
              <button
                type="button"
                class="primary-button primary-button--small"
                :disabled="busyAction !== null"
                @click="acceptSearchResult(person.id)"
              >
                {{ busyAction === `accept:${person.id}` ? '수락 중…' : '수락' }}
              </button>
            </template>
            <template v-else-if="relationshipFor(person.id) === 'outgoing'">
              <span class="friend-relation-badge">요청 보냄</span>
              <button
                type="button"
                class="text-button text-button--danger"
                :disabled="busyAction !== null"
                @click="cancelSearchResult(person.id)"
              >
                {{ busyAction === `outgoing:${person.id}` ? '취소 중…' : '취소' }}
              </button>
            </template>
            <button
              v-else
              type="button"
              class="primary-button primary-button--small"
              :disabled="busyAction !== null"
              @click="sendRequestToUser(person)"
            >
              {{ busyAction === `send:${person.id}` ? '요청 중…' : '친구 추가' }}
            </button>
          </div>
        </li>
      </ul>
    </section>

    <p v-if="message" class="feedback feedback--success" role="status">
      {{ message }}
    </p>
    <p v-if="error" class="feedback feedback--error" role="alert">
      {{ error }}
    </p>

    <p v-if="loading" class="friends-loading" role="status">친구 정보를 불러오는 중…</p>

    <template v-else-if="hasLoadedData">
      <section class="friend-panel friend-tabs-panel">
        <div class="friend-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            class="friend-tab"
            :class="{ 'friend-tab--active': activeTab === 'incoming' }"
            :aria-selected="activeTab === 'incoming'"
            @click="activeTab = 'incoming'"
          >
            받은 요청
            <span>{{ incomingRequests.length }}</span>
          </button>
          <button
            type="button"
            role="tab"
            class="friend-tab"
            :class="{ 'friend-tab--active': activeTab === 'outgoing' }"
            :aria-selected="activeTab === 'outgoing'"
            @click="activeTab = 'outgoing'"
          >
            보낸 요청
            <span>{{ outgoingRequests.length }}</span>
          </button>
          <button
            type="button"
            role="tab"
            class="friend-tab"
            :class="{ 'friend-tab--active': activeTab === 'friends' }"
            :aria-selected="activeTab === 'friends'"
            @click="activeTab = 'friends'"
          >
            친구 목록
            <span>{{ friends.length }}</span>
          </button>
        </div>

        <div class="friend-tab-panel" role="tabpanel">
          <template v-if="activeTab === 'incoming'">
            <p v-if="incomingRequests.length === 0" class="empty-state">
              받은 친구 요청이 없습니다.
            </p>
            <ul v-else class="people-list">
              <li v-for="request in incomingRequests" :key="request.id" class="person-row">
                <PersonAvatar :name="request.name" :image-url="request.profile_image_url" />
                <div class="person-meta">
                  <strong>
                    <RouterLink :to="`/profiles/${request.id}`" class="person-profile-link">
                      {{ request.name }}
                    </RouterLink>
                  </strong>
                  <span>{{ formatDate(request.requested_at) }} 요청</span>
                </div>
                <div class="person-actions">
                  <button
                    type="button"
                    class="primary-button primary-button--small"
                    :disabled="busyAction !== null"
                    @click="acceptRequest(request)"
                  >
                    {{ busyAction === `accept:${request.id}` ? '수락 중…' : '수락' }}
                  </button>
                  <button
                    type="button"
                    class="text-button text-button--danger"
                    :disabled="busyAction !== null"
                    @click="deleteRequest(request, 'incoming')"
                  >
                    {{ busyAction === `incoming:${request.id}` ? '처리 중…' : '거절' }}
                  </button>
                </div>
              </li>
            </ul>
          </template>

          <template v-else-if="activeTab === 'outgoing'">
            <p v-if="outgoingRequests.length === 0" class="empty-state">
              대기 중인 친구 요청이 없습니다.
            </p>
            <ul v-else class="people-list">
              <li v-for="request in outgoingRequests" :key="request.id" class="person-row">
                <PersonAvatar :name="request.name" :image-url="request.profile_image_url" />
                <div class="person-meta">
                  <strong>
                    <RouterLink :to="`/profiles/${request.id}`" class="person-profile-link">
                      {{ request.name }}
                    </RouterLink>
                  </strong>
                  <span>{{ formatDate(request.requested_at) }}부터 대기 중</span>
                </div>
                <button
                  type="button"
                  class="text-button text-button--danger"
                  :disabled="busyAction !== null"
                  @click="deleteRequest(request, 'outgoing')"
                >
                  {{ busyAction === `outgoing:${request.id}` ? '취소 중…' : '요청 취소' }}
                </button>
              </li>
            </ul>
          </template>

          <template v-else>
            <p v-if="friends.length === 0" class="empty-state">아직 수락된 친구가 없습니다.</p>
            <ul v-else class="people-list friend-list">
              <li v-for="friend in friends" :key="friend.id" class="person-row">
                <PersonAvatar :name="friend.name" :image-url="friend.profile_image_url" />
                <div class="person-meta">
                  <strong>
                    <RouterLink :to="`/profiles/${friend.id}`" class="person-profile-link">
                      {{ friend.name }}
                    </RouterLink>
                  </strong>
                  <span
                    class="friend-presence"
                    :class="{ 'friend-presence--online': friend.online }"
                  >
                    {{ friend.online ? '온라인' : '오프라인' }}
                  </span>
                  <span>{{ formatDate(friend.friends_since) }}부터 친구</span>
                </div>
                <div class="person-actions">
                  <button
                    type="button"
                    class="primary-button primary-button--small"
                    :disabled="busyAction !== null"
                    @click="emit('open-dm', friend)"
                  >
                    메시지
                  </button>
                  <button
                    type="button"
                    class="text-button text-button--danger"
                    :disabled="busyAction !== null"
                    @click="removeFriend(friend)"
                  >
                    {{ busyAction === `remove:${friend.id}` ? '삭제 중…' : '친구 삭제' }}
                  </button>
                </div>
              </li>
            </ul>
          </template>
        </div>
      </section>
    </template>

    <p v-else class="friends-loading">
      친구 정보를 표시할 수 없습니다. 새로고침해 다시 시도해 주세요.
    </p>
  </div>
</template>

<style scoped src="../styles/friends-panel.css"></style>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { FriendAPI } from '../api/friend'
import type { PublicProfile } from '../api/profile'
import { SearchAPI } from '../api/search'
import PersonAvatar from './PersonAvatar.vue'
import ProfileLink from './ProfileLink.vue'
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

// 친구 목록과 양방향 요청을 관리하며, 검색 결과에도 현재 관계에 맞는 행동을 즉시 제공한다.
// API 스냅샷과 presence 이벤트의 도착 순서가 뒤집혀도 더 최신 온라인 상태를 유지한다.
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
  // 입력마다 요청하지 않고 짧게 지연하며, 버전이 지난 검색 응답은 새 검색 결과를 덮지 못하게 한다.
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
  // 목록 조회 시작 뒤 도착한 실시간 상태는 조회 응답보다 최신이므로 응답 위에 다시 적용한다.
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
  // 친구 변경 API와 재연결 조회가 경쟁하면 변경이 끝난 직후 한 번만 다시 읽어 정합성을 맞춘다.
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
  // 친구 관련 이벤트는 목록을 부분 갱신하고, 연결 복구 시 놓친 구간만 전체 조회로 보완한다.
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
  <div class="friends-panel-content h-full overflow-y-auto p-4.5 text-gray-900">
    <section
      class="friend-panel friend-search-panel p-4 border border-slate-200 rounded-xl bg-white flex items-stretch flex-col gap-3.5"
    >
      <div>
        <h2 class="text-base">사람 찾기</h2>
        <p class="mt-1.5 text-sm text-slate-500">이름 또는 이메일로 친구를 찾고 요청을 보내세요.</p>
      </div>

      <label
        class="friend-search-field flex items-center gap-2.25 min-h-10.5 px-3 bg-white text-slate-500 focus-within:border-blue-600"
      >
        <span aria-hidden="true">⌕</span>
        <input
          v-model="friendSearchQuery"
          type="search"
          autocomplete="off"
          placeholder="이름 또는 이메일로 친구 찾기"
          aria-label="이름 또는 이메일로 친구 찾기"
          :disabled="loading"
          class="friend-search-input min-w-0 flex-1 border-0 outline-none bg-transparent text-gray-900"
        />
        <small v-if="friendSearchLoading" class="friend-search-loading-label shrink-0 grow-0"
          >검색 중…</small
        >
      </label>

      <p v-if="friendSearchError" class="friend-search-state -mt-0.75" role="alert">
        {{ friendSearchError }}
      </p>
      <p
        v-else-if="
          friendSearchQuery.trim() &&
          !friendSearchLoading &&
          visibleFriendSearchResults.length === 0
        "
        class="friend-search-state -mt-0.75"
      >
        일치하는 사용자가 없습니다.
      </p>

      <ul
        v-if="visibleFriendSearchResults.length"
        class="friend-search-results -mt-0.5 p-0 overflow-hidden border border-slate-200 list-none"
      >
        <li
          v-for="(person, personIndex) in visibleFriendSearchResults"
          :key="person.id"
          class="friend-search-row flex items-center gap-2.5 py-2.5 px-3"
          :class="{ 'border-t border-slate-100': personIndex > 0 }"
        >
          <PersonAvatar :name="person.name" :image-url="person.profile_image_url" />
          <div class="friend-search-copy min-w-0 flex-1">
            <ProfileLink
              :user-id="person.id"
              class="friend-search-name-link block overflow-hidden text-ellipsis whitespace-nowrap"
              >{{ person.name }}</ProfileLink
            >
            <span
              class="friend-search-headline block overflow-hidden text-ellipsis whitespace-nowrap mt-0.5 text-slate-500"
              >{{ person.headline }}</span
            >
          </div>

          <div class="friend-search-actions flex items-center gap-1.25">
            <template v-if="relationshipFor(person.id) === 'friend'">
              <span
                class="friend-relation-badge py-1 px-1.75 rounded-full bg-slate-100 text-slate-500 font-extrabold whitespace-nowrap"
                >친구</span
              >
              <button
                type="button"
                class="text-button border-0 rounded-lg py-1.75 px-2 bg-transparent text-slate-600 font-bold cursor-pointer whitespace-nowrap disabled:cursor-wait disabled:opacity-60"
                :disabled="busyAction !== null"
                @click="openSearchResultDm(person.id)"
              >
                메시지
              </button>
            </template>
            <template v-else-if="relationshipFor(person.id) === 'incoming'">
              <span
                class="friend-relation-badge py-1 px-1.75 rounded-full bg-slate-100 text-slate-500 font-extrabold whitespace-nowrap"
                >요청 받음</span
              >
              <button
                type="button"
                class="primary-button border-0 rounded-lg py-1.75 px-2.5 bg-blue-600 text-white font-bold cursor-pointer whitespace-nowrap disabled:cursor-wait disabled:opacity-60"
                :disabled="busyAction !== null"
                @click="acceptSearchResult(person.id)"
              >
                {{ busyAction === `accept:${person.id}` ? '수락 중…' : '수락' }}
              </button>
            </template>
            <template v-else-if="relationshipFor(person.id) === 'outgoing'">
              <span
                class="friend-relation-badge py-1 px-1.75 rounded-full bg-slate-100 text-slate-500 font-extrabold whitespace-nowrap"
                >요청 보냄</span
              >
              <button
                type="button"
                class="text-button border-0 rounded-lg py-1.75 px-2 bg-transparent text-red-600 font-bold cursor-pointer whitespace-nowrap disabled:cursor-wait disabled:opacity-60"
                :disabled="busyAction !== null"
                @click="cancelSearchResult(person.id)"
              >
                {{ busyAction === `outgoing:${person.id}` ? '취소 중…' : '취소' }}
              </button>
            </template>
            <button
              v-else
              type="button"
              class="primary-button border-0 rounded-lg py-1.75 px-2.5 bg-blue-600 text-white font-bold cursor-pointer whitespace-nowrap disabled:cursor-wait disabled:opacity-60"
              :disabled="busyAction !== null"
              @click="sendRequestToUser(person)"
            >
              {{ busyAction === `send:${person.id}` ? '요청 중…' : '친구 추가' }}
            </button>
          </div>
        </li>
      </ul>
    </section>

    <p
      v-if="message"
      class="feedback mt-4 py-2.75 px-3.25 rounded-lg text-sm bg-emerald-50 text-emerald-700"
      role="status"
    >
      {{ message }}
    </p>
    <p
      v-if="error"
      class="feedback mt-4 py-2.75 px-3.25 rounded-lg text-sm bg-red-50 text-red-700"
      role="alert"
    >
      {{ error }}
    </p>

    <p
      v-if="loading"
      class="friends-loading mt-4 py-2.75 px-3.25 rounded-lg text-sm bg-white text-slate-500"
      role="status"
    >
      친구 정보를 불러오는 중…
    </p>

    <template v-else-if="hasLoadedData">
      <section
        class="friend-panel friend-tabs-panel border border-slate-200 rounded-xl bg-white my-3.5 p-0 overflow-hidden"
      >
        <div class="friend-tabs flex border-b border-slate-200" role="tablist">
          <button
            type="button"
            role="tab"
            class="friend-tab flex flex-1 items-center justify-center gap-1.75 py-3.25 px-2.5 border-0 border-b-2 border-transparent bg-transparent text-slate-500 cursor-pointer"
            :class="{
              'friend-tab--active border-b-blue-600 text-blue-600': activeTab === 'incoming',
            }"
            :aria-selected="activeTab === 'incoming'"
            @click="activeTab = 'incoming'"
          >
            받은 요청
            <span
              class="friend-tab-count grid min-w-5.5 h-5.5 px-1 place-items-center rounded-full font-extrabold"
              :class="
                activeTab === 'incoming'
                  ? 'bg-blue-50 text-blue-700'
                  : 'bg-slate-100 text-slate-500'
              "
              >{{ incomingRequests.length }}</span
            >
          </button>
          <button
            type="button"
            role="tab"
            class="friend-tab flex flex-1 items-center justify-center gap-1.75 py-3.25 px-2.5 border-0 border-b-2 border-transparent bg-transparent text-slate-500 cursor-pointer"
            :class="{
              'friend-tab--active border-b-blue-600 text-blue-600': activeTab === 'outgoing',
            }"
            :aria-selected="activeTab === 'outgoing'"
            @click="activeTab = 'outgoing'"
          >
            보낸 요청
            <span
              class="friend-tab-count grid min-w-5.5 h-5.5 px-1 place-items-center rounded-full font-extrabold"
              :class="
                activeTab === 'outgoing'
                  ? 'bg-blue-50 text-blue-700'
                  : 'bg-slate-100 text-slate-500'
              "
              >{{ outgoingRequests.length }}</span
            >
          </button>
          <button
            type="button"
            role="tab"
            class="friend-tab flex flex-1 items-center justify-center gap-1.75 py-3.25 px-2.5 border-0 border-b-2 border-transparent bg-transparent text-slate-500 cursor-pointer"
            :class="{
              'friend-tab--active border-b-blue-600 text-blue-600': activeTab === 'friends',
            }"
            :aria-selected="activeTab === 'friends'"
            @click="activeTab = 'friends'"
          >
            친구 목록
            <span
              class="friend-tab-count grid min-w-5.5 h-5.5 px-1 place-items-center rounded-full font-extrabold"
              :class="
                activeTab === 'friends' ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-500'
              "
              >{{ friends.length }}</span
            >
          </button>
        </div>

        <div class="friend-tab-panel p-4" role="tabpanel">
          <template v-if="activeTab === 'incoming'">
            <p v-if="incomingRequests.length === 0" class="empty-state mt-0 text-sm">
              받은 친구 요청이 없습니다.
            </p>
            <ul v-else class="people-list mt-0 p-0 list-none">
              <li
                v-for="request in incomingRequests"
                :key="request.id"
                class="person-row flex items-center gap-2.75 py-3 border-b border-slate-100 last:border-b-0"
              >
                <PersonAvatar :name="request.name" :image-url="request.profile_image_url" />
                <div class="person-meta min-w-0 flex-1">
                  <strong class="block overflow-hidden text-ellipsis whitespace-nowrap">
                    <ProfileLink :user-id="request.id" class="person-profile-link">
                      {{ request.name }}
                    </ProfileLink>
                  </strong>
                  <span class="block mt-0.75 text-slate-500 text-xs"
                    >{{ formatDate(request.requested_at) }} 요청</span
                  >
                </div>
                <div class="person-actions flex items-center gap-1">
                  <button
                    type="button"
                    class="primary-button border-0 rounded-lg py-1.75 px-2.5 bg-blue-600 text-white font-bold cursor-pointer whitespace-nowrap disabled:cursor-wait disabled:opacity-60"
                    :disabled="busyAction !== null"
                    @click="acceptRequest(request)"
                  >
                    {{ busyAction === `accept:${request.id}` ? '수락 중…' : '수락' }}
                  </button>
                  <button
                    type="button"
                    class="text-button border-0 rounded-lg py-1.75 px-2 bg-transparent text-red-600 font-bold cursor-pointer whitespace-nowrap disabled:cursor-wait disabled:opacity-60"
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
            <p v-if="outgoingRequests.length === 0" class="empty-state mt-0 text-sm">
              대기 중인 친구 요청이 없습니다.
            </p>
            <ul v-else class="people-list mt-0 p-0 list-none">
              <li
                v-for="request in outgoingRequests"
                :key="request.id"
                class="person-row flex items-center gap-2.75 py-3 border-b border-slate-100 last:border-b-0"
              >
                <PersonAvatar :name="request.name" :image-url="request.profile_image_url" />
                <div class="person-meta min-w-0 flex-1">
                  <strong class="block overflow-hidden text-ellipsis whitespace-nowrap">
                    <ProfileLink :user-id="request.id" class="person-profile-link">
                      {{ request.name }}
                    </ProfileLink>
                  </strong>
                  <span class="block mt-0.75 text-slate-500 text-xs"
                    >{{ formatDate(request.requested_at) }}부터 대기 중</span
                  >
                </div>
                <button
                  type="button"
                  class="text-button border-0 rounded-lg py-1.75 px-2 bg-transparent text-red-600 font-bold cursor-pointer whitespace-nowrap disabled:cursor-wait disabled:opacity-60"
                  :disabled="busyAction !== null"
                  @click="deleteRequest(request, 'outgoing')"
                >
                  {{ busyAction === `outgoing:${request.id}` ? '취소 중…' : '요청 취소' }}
                </button>
              </li>
            </ul>
          </template>

          <template v-else>
            <p v-if="friends.length === 0" class="empty-state mt-0 text-sm">
              아직 수락된 친구가 없습니다.
            </p>
            <ul v-else class="people-list friend-list mt-0 p-0 list-none">
              <li
                v-for="friend in friends"
                :key="friend.id"
                class="person-row flex items-center gap-2.75 py-3 border-b border-slate-100 last:border-b-0"
              >
                <PersonAvatar :name="friend.name" :image-url="friend.profile_image_url" />
                <div class="person-meta min-w-0 flex-1">
                  <strong class="block overflow-hidden text-ellipsis whitespace-nowrap">
                    <ProfileLink :user-id="friend.id" class="person-profile-link">
                      {{ friend.name }}
                    </ProfileLink>
                  </strong>
                  <span
                    class="friend-presence"
                    :class="{ 'friend-presence--online': friend.online }"
                  >
                    {{ friend.online ? '온라인' : '오프라인' }}
                  </span>
                  <span class="block mt-0.75 text-slate-500 text-xs"
                    >{{ formatDate(friend.friends_since) }}부터 친구</span
                  >
                </div>
                <div class="person-actions flex items-center gap-1">
                  <button
                    type="button"
                    class="primary-button border-0 rounded-lg py-1.75 px-2.5 bg-blue-600 text-white font-bold cursor-pointer whitespace-nowrap disabled:cursor-wait disabled:opacity-60"
                    :disabled="busyAction !== null"
                    @click="emit('open-dm', friend)"
                  >
                    메시지
                  </button>
                  <button
                    type="button"
                    class="text-button border-0 rounded-lg py-1.75 px-2 bg-transparent text-red-600 font-bold cursor-pointer whitespace-nowrap disabled:cursor-wait disabled:opacity-60"
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

    <p
      v-else
      class="friends-loading mt-4 py-2.75 px-3.25 rounded-lg text-sm bg-white text-slate-500"
    >
      친구 정보를 표시할 수 없습니다. 새로고침해 다시 시도해 주세요.
    </p>
  </div>
</template>

<style scoped src="../styles/friends-panel.css"></style>

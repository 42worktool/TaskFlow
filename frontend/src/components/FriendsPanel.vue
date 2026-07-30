<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { FriendAPI } from '../api/friend'
import { realtime } from '../services/realtime'
import { parseFriendPresenceEvent } from '../services/realtime/protocol'
import type { Friend, FriendRequest } from '../types'

const emit = defineEmits<{
  changed: []
  'open-dm': [friend: Friend]
}>()

const friends = ref<Friend[]>([])
const incomingRequests = ref<FriendRequest[]>([])
const outgoingRequests = ref<FriendRequest[]>([])
const friendEmail = ref('')
const loading = ref(true)
const hasLoadedData = ref(false)
const busyAction = ref<string | null>(null)
const message = ref('')
const error = ref('')

let loadGeneration = 0
let presenceSequence = 0
let reloadAfterMutation = false
const livePresence = new Map<string, { online: boolean; sequence: number }>()
let removePresenceListener: (() => void) | null = null
let removeRealtimeStateListener: (() => void) | null = null

function applyNewerPresence(friend: Friend, presenceAtStart: number): void {
  const live = livePresence.get(friend.id)
  if (live && live.sequence > presenceAtStart) {
    friend.online = live.online
  }
}

async function loadFriendData(
  options: { preserveFeedback?: boolean } = {},
): Promise<void> {
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

    loadedFriends.forEach((friend) =>
      applyNewerPresence(friend, presenceAtStart),
    )
    friends.value = loadedFriends
    incomingRequests.value = loadedRequests.incoming
    outgoingRequests.value = loadedRequests.outgoing
    hasLoadedData.value = true
  } catch (caught) {
    if (generation !== loadGeneration) return
    error.value =
      caught instanceof Error
        ? caught.message
        : '친구 정보를 불러오지 못했습니다.'
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

async function sendRequest(): Promise<void> {
  const email = friendEmail.value.trim()
  if (!email || busyAction.value) return

  busyAction.value = 'send'
  message.value = ''
  error.value = ''
  try {
    const request = await FriendAPI.sendRequest(email)
    outgoingRequests.value = [
      request,
      ...outgoingRequests.value.filter((item) => item.id !== request.id),
    ]
    friendEmail.value = ''
    message.value = `${request.name}님께 친구 요청을 보냈습니다.`
  } catch (caught) {
    error.value =
      caught instanceof Error
        ? caught.message
        : '친구 요청을 보내지 못했습니다.'
  } finally {
    finishMutation()
  }
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
    friends.value = [
      friend,
      ...friends.value.filter((item) => item.id !== friend.id),
    ]
    incomingRequests.value = incomingRequests.value.filter(
      (item) => item.id !== request.id,
    )
    message.value = `${friend.name}님과 친구가 되었습니다.`
    emit('changed')
  } catch (caught) {
    error.value =
      caught instanceof Error
        ? caught.message
        : '친구 요청을 수락하지 못했습니다.'
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
      incomingRequests.value = incomingRequests.value.filter(
        (item) => item.id !== request.id,
      )
      message.value = `${request.name}님의 친구 요청을 거절했습니다.`
    } else {
      outgoingRequests.value = outgoingRequests.value.filter(
        (item) => item.id !== request.id,
      )
      message.value = `${request.name}님에게 보낸 요청을 취소했습니다.`
    }
  } catch (caught) {
    error.value =
      caught instanceof Error
        ? caught.message
        : '친구 요청을 처리하지 못했습니다.'
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
    error.value =
      caught instanceof Error ? caught.message : '친구를 삭제하지 못했습니다.'
  } finally {
    finishMutation()
  }
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('ko-KR')
}

onMounted(() => {
  removePresenceListener = realtime.on(
    'friend.presence_changed',
    receiveFriendPresence,
  )
  removeRealtimeStateListener = realtime.onStateChange((state) => {
    if (state === 'connected') refreshAfterReconnect()
  })
  void loadFriendData()
})

onUnmounted(() => {
  loadGeneration += 1
  removePresenceListener?.()
  removeRealtimeStateListener?.()
  livePresence.clear()
})
</script>

<template>
  <div class="friends-panel-content">
    <div class="friends-heading">
      <p>요청을 수락한 사용자만 친구 목록과 온라인 상태에 표시됩니다.</p>
      <button
        type="button"
        class="secondary-button"
        :disabled="loading || busyAction !== null"
        @click="loadFriendData()"
      >
        새로고침
      </button>
    </div>

      <section class="friend-panel friend-invite-panel">
        <div>
          <h2>친구 요청 보내기</h2>
          <p>TaskFlow에 가입한 사용자의 이메일을 입력하세요.</p>
        </div>
        <form class="friend-request-form" @submit.prevent="sendRequest">
          <input
            v-model="friendEmail"
            type="email"
            autocomplete="email"
            placeholder="friend@example.com"
            aria-label="친구 이메일"
            :disabled="loading || busyAction !== null"
            required
          />
          <button
            type="submit"
            class="primary-button"
            :disabled="loading || busyAction !== null || !friendEmail.trim()"
          >
            {{ busyAction === 'send' ? '전송 중…' : '요청 보내기' }}
          </button>
        </form>
      </section>

      <p v-if="message" class="feedback feedback--success" role="status">
        {{ message }}
      </p>
      <p v-if="error" class="feedback feedback--error" role="alert">
        {{ error }}
      </p>

      <p v-if="loading" class="friends-loading" role="status">
        친구 정보를 불러오는 중…
      </p>

      <template v-else-if="hasLoadedData">
        <div class="request-grid">
          <section class="friend-panel">
            <div class="section-heading">
              <h2>받은 요청</h2>
              <span>{{ incomingRequests.length }}</span>
            </div>
            <p v-if="incomingRequests.length === 0" class="empty-state">
              받은 친구 요청이 없습니다.
            </p>
            <ul v-else class="people-list">
              <li
                v-for="request in incomingRequests"
                :key="request.id"
                class="person-row"
              >
                <img
                  v-if="request.profile_image_url"
                  :src="request.profile_image_url"
                  alt=""
                  class="person-avatar"
                  referrerpolicy="no-referrer"
                />
                <div v-else class="person-avatar person-avatar--fallback">
                  {{ request.name.charAt(0).toUpperCase() }}
                </div>
                <div class="person-meta">
                  <strong>{{ request.name }}</strong>
                  <span>{{ formatDate(request.requested_at) }} 요청</span>
                </div>
                <div class="person-actions">
                  <button
                    type="button"
                    class="primary-button primary-button--small"
                    :disabled="busyAction !== null"
                    @click="acceptRequest(request)"
                  >
                    {{
                      busyAction === `accept:${request.id}`
                        ? '수락 중…'
                        : '수락'
                    }}
                  </button>
                  <button
                    type="button"
                    class="text-button text-button--danger"
                    :disabled="busyAction !== null"
                    @click="deleteRequest(request, 'incoming')"
                  >
                    {{
                      busyAction === `incoming:${request.id}`
                        ? '처리 중…'
                        : '거절'
                    }}
                  </button>
                </div>
              </li>
            </ul>
          </section>

          <section class="friend-panel">
            <div class="section-heading">
              <h2>보낸 요청</h2>
              <span>{{ outgoingRequests.length }}</span>
            </div>
            <p v-if="outgoingRequests.length === 0" class="empty-state">
              대기 중인 친구 요청이 없습니다.
            </p>
            <ul v-else class="people-list">
              <li
                v-for="request in outgoingRequests"
                :key="request.id"
                class="person-row"
              >
                <img
                  v-if="request.profile_image_url"
                  :src="request.profile_image_url"
                  alt=""
                  class="person-avatar"
                  referrerpolicy="no-referrer"
                />
                <div v-else class="person-avatar person-avatar--fallback">
                  {{ request.name.charAt(0).toUpperCase() }}
                </div>
                <div class="person-meta">
                  <strong>{{ request.name }}</strong>
                  <span>{{ formatDate(request.requested_at) }}부터 대기 중</span>
                </div>
                <button
                  type="button"
                  class="text-button text-button--danger"
                  :disabled="busyAction !== null"
                  @click="deleteRequest(request, 'outgoing')"
                >
                  {{
                    busyAction === `outgoing:${request.id}`
                      ? '취소 중…'
                      : '요청 취소'
                  }}
                </button>
              </li>
            </ul>
          </section>
        </div>

        <section class="friend-panel">
          <div class="section-heading">
            <h2>친구 목록</h2>
            <span>{{ friends.length }}</span>
          </div>
          <p v-if="friends.length === 0" class="empty-state">
            아직 수락된 친구가 없습니다.
          </p>
          <ul v-else class="people-list friend-list">
            <li v-for="friend in friends" :key="friend.id" class="person-row">
              <img
                v-if="friend.profile_image_url"
                :src="friend.profile_image_url"
                alt=""
                class="person-avatar"
                referrerpolicy="no-referrer"
              />
              <div v-else class="person-avatar person-avatar--fallback">
                {{ friend.name.charAt(0).toUpperCase() }}
              </div>
              <div class="person-meta">
                <strong>{{ friend.name }}</strong>
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
                  {{
                    busyAction === `remove:${friend.id}`
                      ? '삭제 중…'
                      : '친구 삭제'
                  }}
                </button>
              </div>
            </li>
          </ul>
        </section>
      </template>

      <p v-else class="friends-loading">
        친구 정보를 표시할 수 없습니다. 새로고침해 다시 시도해 주세요.
      </p>
  </div>
</template>

<style scoped src="../styles/friends-panel.css"></style>

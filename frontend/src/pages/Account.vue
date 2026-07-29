<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import LegalFooter from '../components/LegalFooter.vue'
import { FriendAPI } from '../api/friend'
import { authState, deleteAccount, updateAccount } from '../services/auth'
import { realtime } from '../services/realtime'
import { parseFriendPresenceEvent } from '../services/realtime/protocol'
import type { Friend } from '../types'

const router = useRouter()
const name = ref(authState.user?.name ?? '')
const message = ref('')
const error = ref('')
const saving = ref(false)
const friends = ref<Friend[]>([])
const friendEmail = ref('')
const loadingFriends = ref(true)
const addingFriend = ref(false)
const removingFriendId = ref<string | null>(null)
const friendMessage = ref('')
const friendError = ref('')
let friendLoadGeneration = 0
let presenceSequence = 0
let reloadAfterMutation = false
const livePresence = new Map<
  string,
  { online: boolean; sequence: number }
>()
let removePresenceListener: (() => void) | null = null
let removeRealtimeStateListener: (() => void) | null = null

async function saveProfile() {
  saving.value = true
  message.value = ''
  error.value = ''
  try {
    await updateAccount(name.value)
    message.value = '계정 정보가 저장되었습니다.'
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : '계정 정보를 저장하지 못했습니다.'
  } finally {
    saving.value = false
  }
}

async function removeAccount() {
  const confirmed = window.confirm(
    '계정과 연결된 로그인 정보가 모두 삭제됩니다. 계속하시겠습니까?',
  )
  if (!confirmed) return

  error.value = ''
  try {
    await deleteAccount()
    await router.replace('/signin')
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : '계정을 삭제하지 못했습니다.'
  }
}

async function loadFriends(options: { preserveError?: boolean } = {}) {
  const generation = ++friendLoadGeneration
  const presenceAtStart = presenceSequence
  loadingFriends.value = true
  if (!options.preserveError) friendError.value = ''
  try {
    const loaded = await FriendAPI.list()
    if (generation !== friendLoadGeneration) return
    for (const friend of loaded) {
      const live = livePresence.get(friend.id)
      if (live && live.sequence > presenceAtStart) {
        friend.online = live.online
      }
    }
    friends.value = loaded
  } catch (caught) {
    if (generation !== friendLoadGeneration) return
    friendError.value =
      caught instanceof Error ? caught.message : '친구 목록을 불러오지 못했습니다.'
  } finally {
    if (generation === friendLoadGeneration) loadingFriends.value = false
  }
}

function receiveFriendPresence(value: unknown) {
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

function refreshFriendsAfterReconnect() {
  if (addingFriend.value || removingFriendId.value) {
    reloadAfterMutation = true
    return
  }
  void loadFriends()
}

function runDeferredFriendRefresh() {
  if (
    reloadAfterMutation &&
    !addingFriend.value &&
    !removingFriendId.value
  ) {
    reloadAfterMutation = false
    void loadFriends({ preserveError: true })
  }
}

async function addFriend() {
  if (loadingFriends.value || addingFriend.value || !friendEmail.value.trim()) return
  const presenceAtStart = presenceSequence
  addingFriend.value = true
  friendMessage.value = ''
  friendError.value = ''
  try {
    const friend = await FriendAPI.add(friendEmail.value)
    const live = livePresence.get(friend.id)
    if (live && live.sequence > presenceAtStart) {
      friend.online = live.online
    }
    const existingIndex = friends.value.findIndex((item) => item.id === friend.id)
    if (existingIndex === -1) friends.value.unshift(friend)
    else friends.value[existingIndex] = friend
    friendEmail.value = ''
    friendMessage.value = `${friend.name}님을 친구로 추가했습니다.`
  } catch (caught) {
    friendError.value =
      caught instanceof Error ? caught.message : '친구를 추가하지 못했습니다.'
  } finally {
    addingFriend.value = false
    runDeferredFriendRefresh()
  }
}

async function removeFriend(friend: Friend) {
  if (removingFriendId.value) return
  if (!window.confirm(`${friend.name}님을 친구에서 삭제하시겠습니까?`)) return
  removingFriendId.value = friend.id
  friendMessage.value = ''
  friendError.value = ''
  try {
    await FriendAPI.remove(friend.id)
    friends.value = friends.value.filter((item) => item.id !== friend.id)
  } catch (caught) {
    friendError.value =
      caught instanceof Error ? caught.message : '친구를 삭제하지 못했습니다.'
  } finally {
    removingFriendId.value = null
    runDeferredFriendRefresh()
  }
}

onMounted(() => {
  removePresenceListener = realtime.on(
    'friend.presence_changed',
    receiveFriendPresence,
  )
  removeRealtimeStateListener = realtime.onStateChange((state) => {
    if (state === 'connected') refreshFriendsAfterReconnect()
  })
  void loadFriends()
})

onUnmounted(() => {
  friendLoadGeneration += 1
  removePresenceListener?.()
  removeRealtimeStateListener?.()
  livePresence.clear()
})
</script>

<template>
  <div class="account-page">
    <header class="account-header">
      <RouterLink to="/workspaces" class="account-logo">TaskFlow</RouterLink>
      <RouterLink to="/workspaces" class="back-link">← 돌아가기</RouterLink>
    </header>

    <main class="account-card">
      <h1>계정 설정</h1>
      <p class="account-description">로그인 계정과 내 정보를 관리합니다.</p>

      <div class="identity-row">
        <img
          v-if="authState.user?.profile_image_url"
          :src="authState.user.profile_image_url"
          alt=""
          class="account-avatar"
          referrerpolicy="no-referrer"
        />
        <div v-else class="account-avatar account-avatar--fallback">
          {{ authState.user?.name.charAt(0).toUpperCase() }}
        </div>
        <div>
          <strong>{{ authState.user?.email }}</strong>
          <p>
            {{
              authState.user?.auth_provider === 'google'
                ? 'Google OAuth 연결됨'
                : '이메일 로그인 사용 중'
            }}
          </p>
        </div>
      </div>

      <form class="account-form" @submit.prevent="saveProfile">
        <label for="account-name">표시 이름</label>
        <input id="account-name" v-model="name" type="text" minlength="2" maxlength="80" required />
        <p v-if="message" class="form-message form-message--success" role="status">{{ message }}</p>
        <p v-if="error" class="form-message form-message--error" role="alert">{{ error }}</p>
        <button type="submit" class="primary-button" :disabled="saving">
          {{ saving ? '저장 중…' : '변경사항 저장' }}
        </button>
      </form>

      <section id="friends" class="friends-section">
        <h2>친구 관리</h2>
        <p class="friends-description">
          가입한 이메일로 친구를 추가할 수 있습니다.
        </p>

        <form class="friend-add-form" @submit.prevent="addFriend">
          <input
            v-model="friendEmail"
            type="email"
            autocomplete="email"
            placeholder="friend@example.com"
            aria-label="친구 이메일"
            :disabled="loadingFriends || addingFriend"
            required
          />
          <button
            type="submit"
            class="primary-button"
            :disabled="loadingFriends || addingFriend || !friendEmail.trim()"
          >
            {{ addingFriend ? '추가 중…' : '친구 추가' }}
          </button>
        </form>

        <p
          v-if="friendMessage"
          class="form-message form-message--success"
          role="status"
        >
          {{ friendMessage }}
        </p>
        <p
          v-if="friendError"
          class="form-message form-message--error"
          role="alert"
        >
          {{ friendError }}
        </p>

        <p v-if="loadingFriends" class="friends-state" role="status">
          친구 목록을 불러오는 중…
        </p>
        <p v-else-if="!friendError && friends.length === 0" class="friends-state">
          아직 추가한 친구가 없습니다.
        </p>
        <ul v-else class="friend-list">
          <li v-for="friend in friends" :key="friend.id" class="friend-row">
            <img
              v-if="friend.profile_image_url"
              :src="friend.profile_image_url"
              alt=""
              class="friend-avatar"
              referrerpolicy="no-referrer"
            />
            <div v-else class="friend-avatar friend-avatar--fallback">
              {{ friend.name.charAt(0).toUpperCase() }}
            </div>
            <div class="friend-meta">
              <strong>{{ friend.name }}</strong>
              <span
                class="friend-presence"
                :class="{ 'friend-presence--online': friend.online }"
              >
                {{ friend.online ? '온라인' : '오프라인' }}
              </span>
              <span>
                {{ new Date(friend.friends_since).toLocaleDateString('ko-KR') }}부터 친구
              </span>
            </div>
            <button
              type="button"
              class="friend-remove-button"
              :disabled="removingFriendId !== null"
              @click="removeFriend(friend)"
            >
              {{ removingFriendId === friend.id ? '삭제 중…' : '삭제' }}
            </button>
          </li>
        </ul>
      </section>

      <section class="danger-zone">
        <h2>계정 삭제</h2>
        <p>계정과 로그인 정보가 영구적으로 삭제됩니다.</p>
        <button type="button" class="danger-button" @click="removeAccount">계정 삭제</button>
      </section>
    </main>

    <LegalFooter variant="light" />
  </div>
</template>

<style scoped src="../styles/account.css"></style>

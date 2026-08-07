<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { authState, logout } from '../services/auth'
import AccountLink from './AccountLink.vue'
import ProfileLink from './ProfileLink.vue'

const router = useRouter()
const open = ref(false)
const root = ref<HTMLElement | null>(null)
const trigger = ref<HTMLButtonElement | null>(null)
const user = computed(() => authState.user)
const initial = computed(() => user.value?.name.trim().charAt(0).toUpperCase() || '?')

function closeAndRestoreFocus(): void {
  open.value = false
  void nextTick(() => trigger.value?.focus())
}

function handleDocumentPointer(event: PointerEvent): void {
  const target = event.target
  if (target instanceof Node && !root.value?.contains(target)) open.value = false
}

function handleDocumentKeydown(event: KeyboardEvent): void {
  if (!open.value || event.key !== 'Escape') return
  event.preventDefault()
  closeAndRestoreFocus()
}

async function handleLogout() {
  open.value = false
  await logout()
  await router.push('/signin')
}

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
  <div ref="root" class="profile-menu">
    <button
      ref="trigger"
      type="button"
      class="avatar-button"
      aria-label="내 메뉴 열기"
      aria-haspopup="menu"
      :aria-expanded="open"
      @click="open = !open"
    >
      <img
        v-if="user?.profile_image_url"
        :src="user.profile_image_url"
        alt=""
        class="avatar-image"
        referrerpolicy="no-referrer"
      />
      <template v-else>{{ initial }}</template>
    </button>

    <div v-if="open" class="menu-panel" role="menu">
      <div class="profile-summary">
        <div class="profile-avatar">
          <img
            v-if="user?.profile_image_url"
            :src="user.profile_image_url"
            alt=""
            class="avatar-image"
            referrerpolicy="no-referrer"
          />
          <template v-else>{{ initial }}</template>
        </div>
        <div class="profile-text">
          <p class="profile-name">{{ user?.name }}</p>
          <p class="profile-email">{{ user?.email }}</p>
        </div>
      </div>

      <div class="menu-divider" />

      <ProfileLink v-if="user" :user-id="user.id" class="menu-item" @click="open = false">
        내 프로필
      </ProfileLink>
      <AccountLink class="menu-item" @click="open = false">계정 설정</AccountLink>
      <RouterLink to="/terms" class="menu-item" @click="open = false">이용약관</RouterLink>
      <RouterLink to="/privacy" class="menu-item" @click="open = false"
        >개인정보처리방침</RouterLink
      >

      <div class="menu-divider" />

      <button type="button" class="menu-item" role="menuitem" @click="handleLogout">
        로그아웃
      </button>
    </div>
  </div>
</template>

<style scoped src="../styles/profile-menu.css"></style>

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
  <div ref="root" class="relative shrink-0">
    <button
      ref="trigger"
      type="button"
      class="avatar-button w-8 h-8 rounded-full flex items-center justify-center border-none font-bold text-white overflow-hidden bg-blue-600"
      aria-label="내 메뉴 열기"
      aria-haspopup="menu"
      :aria-expanded="open"
      @click="open = !open"
    >
      <img
        v-if="user?.profile_image_url"
        :src="user.profile_image_url"
        alt=""
        class="w-full h-full object-cover"
        referrerpolicy="no-referrer"
      />
      <template v-else>{{ initial }}</template>
    </button>

    <div v-if="open" class="menu-panel" role="menu">
      <div class="flex items-center gap-2.5 p-2">
        <div
          class="avatar-button w-8 h-8 rounded-full flex items-center justify-center border-none font-bold text-white overflow-hidden bg-blue-600 shrink-0"
        >
          <img
            v-if="user?.profile_image_url"
            :src="user.profile_image_url"
            alt=""
            class="w-full h-full object-cover"
            referrerpolicy="no-referrer"
          />
          <template v-else>{{ initial }}</template>
        </div>
        <div class="min-w-0">
          <p class="text-sm font-bold text-gray-900">{{ user?.name }}</p>
          <p class="mt-0.5 text-xs text-gray-500 overflow-hidden text-ellipsis whitespace-nowrap">
            {{ user?.email }}
          </p>
        </div>
      </div>

      <div class="h-px my-1.5 bg-gray-200" />

      <ProfileLink
        v-if="user"
        :user-id="user.id"
        class="menu-item block w-full rounded-md border-none bg-transparent px-2.5! py-2.25! text-left text-gray-700 no-underline hover:bg-gray-100 hover:text-gray-900"
        @click="open = false"
      >
        내 프로필
      </ProfileLink>
      <AccountLink
        class="menu-item w-full block py-2.25 px-2.5 border-none rounded-md bg-transparent text-left text-gray-700 no-underline hover:bg-gray-100 hover:text-gray-900"
        @click="open = false"
      >
        계정 설정
      </AccountLink>
      <RouterLink
        to="/terms"
        class="menu-item w-full block py-2.25 px-2.5 border-none rounded-md bg-transparent text-left text-gray-700 no-underline hover:bg-gray-100 hover:text-gray-900"
        @click="open = false"
        >이용약관</RouterLink
      >
      <RouterLink
        to="/privacy"
        class="menu-item w-full block py-2.25 px-2.5 border-none rounded-md bg-transparent text-left text-gray-700 no-underline hover:bg-gray-100 hover:text-gray-900"
        @click="open = false"
        >개인정보처리방침</RouterLink
      >

      <div class="h-px my-1.5 bg-gray-200" />

      <button
        type="button"
        class="menu-item w-full block py-2.25 px-2.5 border-none rounded-md bg-transparent text-left text-gray-700 no-underline hover:bg-gray-100 hover:text-gray-900"
        role="menuitem"
        @click="handleLogout"
      >
        로그아웃
      </button>
    </div>
  </div>
</template>

<style scoped src="../styles/profile-menu.css"></style>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { authState, logout } from '../services/auth'

const router = useRouter()
const open = ref(false)
const user = computed(() => authState.user)
const initial = computed(() => user.value?.name.trim().charAt(0).toUpperCase() || '?')

async function handleLogout() {
  open.value = false
  await logout()
  await router.push('/signin')
}
</script>

<template>
  <div class="profile-menu">
    <button
      type="button"
      class="avatar-button"
      aria-label="내 메뉴 열기"
      @click="open = !open"
      @blur="open = false"
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

    <div v-if="open" class="menu-panel" @mousedown.prevent>
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

      <RouterLink to="/account" class="menu-item" @click="open = false">계정 설정</RouterLink>
      <button type="button" class="menu-item" @click="handleLogout">로그아웃</button>
    </div>
  </div>
</template>

<style scoped src="../styles/profile-menu.css"></style>

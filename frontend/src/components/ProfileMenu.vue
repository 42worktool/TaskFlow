<script setup lang="ts">
import { ref } from 'vue'
import { currentUser } from '../mock/data'

const open = ref(false)

const menuItems = ['공개 프로필 설정', '보안 설정', '알림 설정', '로그아웃']
</script>

<template>
  <div class="profile-menu">
    <button
      type="button"
      class="avatar-button"
      :style="{ background: currentUser.avatar_color }"
      aria-label="내 메뉴 열기"
      @click="open = !open"
      @blur="open = false"
    >
      {{ currentUser.avatar }}
    </button>

    <div v-if="open" class="menu-panel" @mousedown.prevent>
      <div class="profile-summary">
        <div class="profile-avatar" :style="{ background: currentUser.avatar_color }">
          {{ currentUser.avatar }}
        </div>
        <div class="profile-text">
          <p class="profile-name">{{ currentUser.name }}</p>
          <p class="profile-email">{{ currentUser.email }}</p>
        </div>
      </div>

      <div class="menu-divider" />

      <button v-for="item in menuItems" :key="item" type="button" class="menu-item">
        {{ item }}
      </button>
    </div>
  </div>
</template>

<style scoped src="../styles/profile-menu.css"></style>

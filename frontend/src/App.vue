<script setup lang="ts">
import MessengerHost from './components/MessengerHost.vue'
import ProfileModalHost from './components/ProfileModalHost.vue'

// 라우트 화면이 바뀌어도 유지돼야 하는 메신저와 전역 프로필 모달을 앱 루트에 둔다.
</script>

<template>
  <RouterView />
  <MessengerHost />
  <ProfileModalHost />
</template>

<script setup lang="ts">
import LegalFooter from '../components/LegalFooter.vue'

// 로그인·회원가입 폼 내용만 slot으로 받고 배경, 카드 폭, 법적 링크 배치를 공통화한다.
</script>

<template>
  <div
    class="auth-bg min-h-screen flex flex-col items-center justify-center relative overflow-hidden"
  >
    <div class="circle absolute rounded-full pointer-events-none w-105 h-105 -left-30 top-20" />
    <div class="circle absolute rounded-full pointer-events-none w-80 h-80 -right-15 bottom-15" />
    <main class="auth-card bg-white rounded-2xl py-10 px-11 w-full max-w-105">
      <slot />
    </main>
    <div class="absolute bottom-6">
      <LegalFooter />
    </div>
  </div>
</template>

<style scoped src="../styles/auth-layout.css"></style>

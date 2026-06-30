<script setup lang="ts">
import LegalFooter from '../components/LegalFooter.vue'
</script>

<template>
  <div class="auth-bg">
    <div class="circle circle-1" />
    <div class="circle circle-2" />
    <main class="auth-card">
      <slot />
    </main>
    <div class="auth-footer-wrap">
      <LegalFooter />
    </div>
  </div>
</template>

<style scoped src="../styles/auth-layout.css"></style>

<script setup lang="ts">
defineProps<{ tagline: string }>()
</script>

<template>
  <div class="logo-wrap">
    <div class="logo-icon">T</div>
    <h1 class="app-name">TaskFlow</h1>
    <p class="app-desc">{{ tagline }}</p>
  </div>
</template>

<style scoped src="../styles/app-logo.css"></style>

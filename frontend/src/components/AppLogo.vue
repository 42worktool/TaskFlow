<script setup lang="ts">
defineProps<{ tagline: string }>()
</script>

<template>
  <div class="text-center mb-7">
    <div class="logo-icon w-15 h-15 bg-blue-600 flex items-center justify-center font-extrabold text-white mx-auto mb-3">T</div>
    <h1 class="app-name font-bold text-gray-900 mb-1">TaskFlow</h1>
    <p class="text-sm text-gray-500">{{ tagline }}</p>
  </div>
</template>

<style scoped src="../styles/app-logo.css"></style>

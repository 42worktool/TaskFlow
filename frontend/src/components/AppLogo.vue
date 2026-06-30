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

<style scoped>
.logo-wrap {
  text-align: center;
  margin-bottom: 28px;
}

.logo-icon {
  width: 60px;
  height: 60px;
  background: #2563eb;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  font-weight: 800;
  color: #fff;
  margin: 0 auto 12px;
}

.app-name {
  font-size: 22px;
  font-weight: 700;
  color: #111827;
  margin-bottom: 4px;
}

.app-desc {
  font-size: 14px;
  color: #6b7280;
}
</style>

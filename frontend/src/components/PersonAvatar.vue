<script setup lang="ts">
defineProps<{
  name: string
  imageUrl: string | null
}>()
</script>

<template>
  <img
    v-if="imageUrl"
    :src="imageUrl"
    alt=""
    class="person-avatar"
    referrerpolicy="no-referrer"
  />
  <div v-else class="person-avatar person-avatar--fallback">
    {{ name.charAt(0).toUpperCase() }}
  </div>
</template>

<style scoped src="../styles/person-avatar.css"></style>

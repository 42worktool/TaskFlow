<script setup lang="ts">
withDefaults(
  defineProps<{
    variant?: 'dark' | 'light'
  }>(),
  {
    variant: 'dark',
  },
)
</script>

<template>
  <footer class="legal-footer" :class="`legal-footer--${variant}`">
    © 2025 TaskFlow · 이용약관 · 개인정보처리방침
  </footer>
</template>

<style scoped src="../styles/legal-footer.css"></style>

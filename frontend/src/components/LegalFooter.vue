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
    © 2026 TaskFlow · <RouterLink to="/terms">이용약관</RouterLink> ·
    <RouterLink to="/privacy">개인정보처리방침</RouterLink>
  </footer>
</template>

<style scoped src="../styles/legal-footer.css"></style>

<script setup lang="ts">
import PageHeader from '../components/PageHeader.vue'

withDefaults(defineProps<{ title: string; effectiveDate?: string }>(), {
  effectiveDate: '2026년 7월 22일',
})
</script>

<template>
  <div class="legal-page-shell">
    <PageHeader />
    <main class="legal-document">
      <h1>{{ title }}</h1>
      <p class="effective-date">시행일: {{ effectiveDate }}</p>
      <slot />
    </main>
  </div>
</template>

<style src="../styles/legal-page.css"></style>

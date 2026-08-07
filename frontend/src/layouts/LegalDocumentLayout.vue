<script setup lang="ts">
import PageHeader from '../components/PageHeader.vue'

withDefaults(defineProps<{ title: string; effectiveDate?: string }>(), {
  effectiveDate: '2026년 7월 22일',
})
</script>

<template>
  <div class="min-h-screen px-6 pb-12 bg-slate-50 text-gray-800">
    <PageHeader />
    <main class="legal-document mx-auto py-10 px-11 border border-gray-200 rounded-2xl bg-white">
      <h1 class="text-3xl text-gray-900">{{ title }}</h1>
      <p class="effective-date text-gray-500">시행일: {{ effectiveDate }}</p>
      <slot />
    </main>
  </div>
</template>

<style src="../styles/legal-page.css"></style>

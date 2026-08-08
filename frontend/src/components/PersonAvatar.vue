<script setup lang="ts">
// 프로필 이미지 유무와 관계없이 목록이 같은 크기의 사람 식별자를 표시하도록 한다.
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
    class="w-10 h-10 shrink-0 grow-0 basis-10 rounded-full object-cover"
    referrerpolicy="no-referrer"
  />
  <div
    v-else
    class="w-10 h-10 shrink-0 grow-0 basis-10 rounded-full grid place-items-center bg-blue-600 text-white font-extrabold"
  >
    {{ name.charAt(0).toUpperCase() }}
  </div>
</template>

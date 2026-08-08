<script setup lang="ts">
import { openAccountModal } from '../services/profileModal'

// 일반 클릭만 계정 모달로 가로채고 수정키 클릭은 링크의 새 탭 동작을 그대로 허용한다.
function openAccount(event: MouseEvent): void {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return
  }

  event.preventDefault()
  openAccountModal()
}
</script>

<template>
  <a href="/account" aria-haspopup="dialog" @click="openAccount"><slot /></a>
</template>

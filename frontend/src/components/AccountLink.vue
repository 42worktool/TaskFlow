<script setup lang="ts">
import { openAccountModal } from '../services/profileModal'

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

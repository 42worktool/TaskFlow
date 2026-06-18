<script setup lang="ts">
import { ref } from 'vue'
import Board from './components/Board.vue'
import LoginPage from './components/LoginPage.vue'
import type { User } from './type'

const currentUser = ref<User | null>(null)

function handleLogin(user: User) {
  currentUser.value = user
}

function handleLogout() {
  currentUser.value = null
}
</script>

<template>
  <LoginPage v-if="!currentUser" @login="handleLogin" />
  <Board v-else :current-user="currentUser" @logout="handleLogout" />
</template>

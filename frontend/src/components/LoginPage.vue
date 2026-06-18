<script setup lang="ts">
import { ref } from 'vue'
import type { User } from '../type'
import { mockUsers } from '../mock'

const email = ref('')
const password = ref('')
const errorMessage = ref('')

const emit = defineEmits<{
  login: [user: User]
}>()

function handleSubmit() {
  const user = mockUsers.find((mockUser) => mockUser.email === email.value.trim())

  if (!user || password.value !== 'password') {
    errorMessage.value = 'Email or password is incorrect.'
    return
  }

  errorMessage.value = ''
  emit('login', user)
}
</script>

<template>
  <main class="login-page">
    <form class="login-form" @submit.prevent="handleSubmit">
      <div>
        <h1>Sign in</h1>
        <p>Use a mock account to open the board.</p>
      </div>

      <label>
        Email
        <input v-model="email" type="email" autocomplete="email" placeholder="hoshino@example.com" />
      </label>

      <label>
        Password
        <input v-model="password" type="password" autocomplete="current-password" placeholder="password" />
      </label>

      <p v-if="errorMessage" class="form-error">{{ errorMessage }}</p>

      <button type="submit">Sign in</button>
    </form>
  </main>
</template>

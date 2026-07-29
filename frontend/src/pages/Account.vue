<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import LegalFooter from '../components/LegalFooter.vue'
import { authState, deleteAccount, updateAccount } from '../services/auth'

const router = useRouter()
const name = ref(authState.user?.name ?? '')
const message = ref('')
const error = ref('')
const saving = ref(false)

async function saveProfile() {
  saving.value = true
  message.value = ''
  error.value = ''
  try {
    await updateAccount(name.value)
    message.value = '계정 정보가 저장되었습니다.'
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : '계정 정보를 저장하지 못했습니다.'
  } finally {
    saving.value = false
  }
}

async function removeAccount() {
  const confirmed = window.confirm(
    '계정과 연결된 로그인 정보가 모두 삭제됩니다. 계속하시겠습니까?',
  )
  if (!confirmed) return

  error.value = ''
  try {
    await deleteAccount()
    await router.replace('/signin')
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : '계정을 삭제하지 못했습니다.'
  }
}

</script>

<template>
  <div class="account-page">
    <header class="account-header">
      <RouterLink to="/workspaces" class="account-logo">TaskFlow</RouterLink>
      <RouterLink to="/workspaces" class="back-link">← 돌아가기</RouterLink>
    </header>

    <main class="account-card">
      <h1>계정 설정</h1>
      <p class="account-description">로그인 계정과 내 정보를 관리합니다.</p>

      <div class="identity-row">
        <img
          v-if="authState.user?.profile_image_url"
          :src="authState.user.profile_image_url"
          alt=""
          class="account-avatar"
          referrerpolicy="no-referrer"
        />
        <div v-else class="account-avatar account-avatar--fallback">
          {{ authState.user?.name.charAt(0).toUpperCase() }}
        </div>
        <div>
          <strong>{{ authState.user?.email }}</strong>
          <p>
            {{
              authState.user?.auth_provider === 'google'
                ? 'Google OAuth 연결됨'
                : '이메일 로그인 사용 중'
            }}
          </p>
        </div>
      </div>

      <form class="account-form" @submit.prevent="saveProfile">
        <label for="account-name">표시 이름</label>
        <input id="account-name" v-model="name" type="text" minlength="2" maxlength="80" required />
        <p v-if="message" class="form-message form-message--success" role="status">{{ message }}</p>
        <p v-if="error" class="form-message form-message--error" role="alert">{{ error }}</p>
        <button type="submit" class="primary-button" :disabled="saving">
          {{ saving ? '저장 중…' : '변경사항 저장' }}
        </button>
      </form>

      <section class="danger-zone">
        <h2>계정 삭제</h2>
        <p>계정과 로그인 정보가 영구적으로 삭제됩니다.</p>
        <button type="button" class="danger-button" @click="removeAccount">계정 삭제</button>
      </section>
    </main>

    <LegalFooter variant="light" />
  </div>
</template>

<style scoped src="../styles/account.css"></style>

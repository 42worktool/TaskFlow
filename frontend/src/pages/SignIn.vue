<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AuthLayout from '../layouts/AuthLayout.vue'
import AppLogo from '../components/AppLogo.vue'
import AuthInput from '../components/AuthInput.vue'
import { loginWithPassword, startGoogleLogin } from '../services/auth'

const route = useRoute()
const router = useRouter()
const email = ref('')
const password = ref('')
const formError = ref('')
const submitting = ref(false)
const redirectTarget = computed(() =>
  typeof route.query.redirect === 'string' && route.query.redirect.startsWith('/')
    ? route.query.redirect
    : '/workspaces',
)
const signupLocation = computed(() => ({
  path: '/signup',
  query: redirectTarget.value === '/workspaces' ? {} : { redirect: redirectTarget.value },
}))

const oauthError = computed(() => {
  const code = typeof route.query.oauth_error === 'string' ? route.query.oauth_error : ''
  const messages: Record<string, string> = {
    access_denied: 'Google 로그인이 취소되었습니다.',
    account_link_required: '같은 이메일의 기존 계정이 있습니다. 기존 로그인 방식을 사용해 주세요.',
    invalid_oauth_state: '로그인 요청이 만료되었거나 올바르지 않습니다. 다시 시도해 주세요.',
    expired_oauth_state: '로그인 요청이 만료되었습니다. 다시 시도해 주세요.',
    invalid_oauth_nonce: '로그인 검증에 실패했습니다. 다시 시도해 주세요.',
  }
  return code ? (messages[code] ?? 'Google 로그인을 완료하지 못했습니다. 다시 시도해 주세요.') : ''
})

function loginWithGoogle() {
  startGoogleLogin(redirectTarget.value)
}

async function loginWithEmail() {
  formError.value = ''
  submitting.value = true
  try {
    await loginWithPassword(email.value, password.value)
    await router.replace(redirectTarget.value)
  } catch (error) {
    formError.value = error instanceof Error ? error.message : '로그인하지 못했습니다.'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <AuthLayout>
    <AppLogo tagline="팀 업무를 한눈에 관리하세요" />

    <p v-if="oauthError" class="auth-message auth-message--error" role="alert">
      {{ oauthError }}
    </p>

    <div class="oauth-section">
      <button
        type="button"
        class="oauth-btn oauth-google"
        :disabled="submitting"
        @click="loginWithGoogle"
      >
        <svg class="google-icon" viewBox="0 0 18 18" aria-hidden="true">
          <path
            fill="#4285F4"
            d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.62Z"
          />
          <path
            fill="#34A853"
            d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.8.54-1.84.86-3.05.86-2.34 0-4.33-1.58-5.04-3.71H.96v2.33A9 9 0 0 0 9 18Z"
          />
          <path
            fill="#FBBC05"
            d="M3.96 10.71A5.42 5.42 0 0 1 3.68 9c0-.59.1-1.16.28-1.71V4.96H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.04l3-2.33Z"
          />
          <path
            fill="#EA4335"
            d="M9 3.58c1.32 0 2.51.46 3.45 1.35l2.58-2.59A8.65 8.65 0 0 0 9 0 9 9 0 0 0 .96 4.96l3 2.33C4.67 5.16 6.66 3.58 9 3.58Z"
          />
        </svg>
        Google로 계속하기
      </button>
    </div>

    <div class="divider">또는</div>

    <form class="auth-form" @submit.prevent="loginWithEmail">
      <AuthInput
        v-model="email"
        type="email"
        name="email"
        autocomplete="email"
        placeholder="이메일 주소"
        :disabled="submitting"
      />
      <AuthInput
        v-model="password"
        type="password"
        name="password"
        autocomplete="current-password"
        placeholder="비밀번호"
        :disabled="submitting"
      />
      <p v-if="formError" class="auth-message auth-message--error" role="alert">
        {{ formError }}
      </p>
      <button type="submit" class="auth-submit" :disabled="submitting">
        {{ submitting ? '로그인 중…' : '이메일로 로그인' }}
      </button>
    </form>

    <p class="auth-switch-link">
      계정이 없으신가요?
      <RouterLink :to="signupLocation">회원가입 →</RouterLink>
    </p>
  </AuthLayout>
</template>

<style scoped src="../styles/sign-in.css"></style>
<style scoped src="../styles/auth-form.css"></style>

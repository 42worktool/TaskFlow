<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AuthLayout from '../layouts/AuthLayout.vue'
import AppLogo from '../components/AppLogo.vue'
import AuthInput from '../components/AuthInput.vue'
import { signupWithPassword } from '../services/auth'

const route = useRoute()
const router = useRouter()
const name = ref('')
const email = ref('')
const password = ref('')
const passwordConfirm = ref('')
const passwordError = ref('')
const formError = ref('')
const submitting = ref(false)
const redirectTarget = computed(() =>
  typeof route.query.redirect === 'string' && route.query.redirect.startsWith('/')
    ? route.query.redirect
    : '/workspaces',
)
const signinLocation = computed(() => ({
  path: '/signin',
  query: redirectTarget.value === '/workspaces' ? {} : { redirect: redirectTarget.value },
}))

async function signup() {
  formError.value = ''
  if (password.value !== passwordConfirm.value) {
    passwordError.value = '비밀번호가 일치하지 않습니다.'
    return
  }
  passwordError.value = ''
  submitting.value = true
  try {
    await signupWithPassword(name.value, email.value, password.value)
    await router.replace(redirectTarget.value)
  } catch (error) {
    formError.value = error instanceof Error ? error.message : '회원가입을 완료하지 못했습니다.'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <AuthLayout>
    <AppLogo tagline="새 계정 만들기" />

    <form class="auth-form" @submit.prevent="signup">
      <AuthInput
        v-model="name"
        type="text"
        name="name"
        autocomplete="name"
        placeholder="이름"
        :minlength="2"
        :maxlength="80"
        :disabled="submitting"
      />
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
        autocomplete="new-password"
        placeholder="비밀번호 (8자 이상)"
        :minlength="8"
        :maxlength="128"
        :disabled="submitting"
      />
      <AuthInput
        v-model="passwordConfirm"
        type="password"
        name="password-confirm"
        autocomplete="new-password"
        placeholder="비밀번호 확인"
        :minlength="8"
        :maxlength="128"
        :disabled="submitting"
      />
      <p v-if="passwordError" class="auth-error">{{ passwordError }}</p>
      <p v-if="formError" class="auth-error" role="alert">{{ formError }}</p>
      <p class="legal-consent">
        회원가입하면 <RouterLink to="/terms">서비스 이용약관</RouterLink> 및
        <RouterLink to="/privacy">개인정보처리방침</RouterLink>에 동의하게 됩니다.
      </p>
      <button type="submit" class="auth-submit" :disabled="submitting">
        {{ submitting ? '가입 중…' : '회원가입' }}
      </button>
    </form>

    <p class="auth-switch-link">
      이미 계정이 있으신가요?
      <RouterLink :to="signinLocation">로그인 →</RouterLink>
    </p>
  </AuthLayout>
</template>

<style scoped src="../styles/sign-up.css"></style>
<style scoped src="../styles/auth-form.css"></style>

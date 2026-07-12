<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import AuthLayout from '../layouts/AuthLayout.vue'
import AppLogo from '../components/AppLogo.vue'

const router = useRouter()
const email = ref('')
const password = ref('')

function login() {
  router.push('/workspaces')
}
</script>

<template>
  <AuthLayout>
    <AppLogo tagline="팀 업무를 한눈에 관리하세요" />

    <div class="oauth-section">
      <button class="oauth-btn oauth-google">
        <span class="google-icon">G</span>
        Google로 계속하기
      </button>
      <button class="oauth-btn oauth-github">
        <span class="github-icon">&lt;/&gt;</span>
        GitHub로 계속하기
      </button>
    </div>

    <div class="divider"><span>또는</span></div>

    <form class="email-form" @submit.prevent="login">
      <input v-model="email" type="email" placeholder="이메일 주소" class="form-input" />
      <input v-model="password" type="password" placeholder="비밀번호" class="form-input" />
      <button type="submit" class="login-btn">로그인</button>
    </form>

    <p class="signup-link">
      계정이 없으신가요?
      <RouterLink to="/signup">회원가입 →</RouterLink>
    </p>
  </AuthLayout>
</template>

<style scoped src="../styles/sign-in.css"></style>

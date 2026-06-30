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

<style scoped>
.oauth-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 20px;
}

.oauth-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 12px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid #e5e7eb;
}

.oauth-google {
  background: #fff;
  color: #374151;
}

.oauth-google:hover {
  background: #f9fafb;
}

.google-icon {
  font-size: 16px;
  font-weight: 700;
  color: #ea4335;
}

.oauth-github {
  background: #1f2937;
  color: #fff;
  border-color: #1f2937;
}

.oauth-github:hover {
  background: #111827;
}

.github-icon {
  font-size: 14px;
  font-weight: 700;
}

.divider {
  display: flex;
  align-items: center;
  gap: 12px;
  color: #9ca3af;
  font-size: 13px;
  margin-bottom: 20px;
}

.divider::before,
.divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: #e5e7eb;
}

.email-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 16px;
}

.form-input {
  padding: 12px 14px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  font-size: 14px;
  color: #111827;
  background: #f9fafb;
}

.form-input::placeholder {
  color: #9ca3af;
}

.form-input:focus {
  border-color: #2563EB;
  background: #fff;
  outline: none;
}

.login-btn {
  padding: 13px;
  background: #2563EB;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  margin-top: 4px;
}

.login-btn:hover {
  background: #1d4ed8;
}

.signup-link {
  text-align: center;
  font-size: 13px;
  color: #6b7280;
}

.signup-link a {
  color: #2563EB;
  font-weight: 500;
}
</style>

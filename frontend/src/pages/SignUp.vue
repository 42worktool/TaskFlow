<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import AuthLayout from '../layouts/AuthLayout.vue'
import AppLogo from '../components/AppLogo.vue'

const router = useRouter()
const name = ref('')
const email = ref('')
const password = ref('')
const passwordConfirm = ref('')
const passwordError = ref('')

function signup() {
  if (password.value !== passwordConfirm.value) {
    passwordError.value = '비밀번호가 일치하지 않습니다.'
    return
  }
  passwordError.value = ''
  router.push('/workspaces')
}
</script>

<template>
  <AuthLayout>
    <AppLogo tagline="새 계정 만들기" />

    <form class="form" @submit.prevent="signup">
      <input v-model="name" type="text" placeholder="이름" class="form-input" />
      <input v-model="email" type="email" placeholder="이메일 주소" class="form-input" />
      <input v-model="password" type="password" placeholder="비밀번호" class="form-input" />
      <input v-model="passwordConfirm" type="password" placeholder="비밀번호 확인" class="form-input" />
      <p v-if="passwordError" class="error-msg">{{ passwordError }}</p>
      <button type="submit" class="submit-btn">회원가입</button>
    </form>

    <p class="login-link">
      이미 계정이 있으신가요?
      <RouterLink to="/signin">로그인 →</RouterLink>
    </p>
  </AuthLayout>
</template>

<style scoped>
.form {
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

.submit-btn {
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

.submit-btn:hover {
  background: #1d4ed8;
}

.login-link {
  text-align: center;
  font-size: 13px;
  color: #6b7280;
}

.login-link a {
  color: #2563EB;
  font-weight: 500;
}

.error-msg {
  font-size: 13px;
  color: #ef4444;
  margin-top: -2px;
}
</style>

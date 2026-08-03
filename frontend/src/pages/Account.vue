<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import PageHeader from '../components/PageHeader.vue'
import { authState, deleteAccount, updateAccount, removeAvatar, uploadAvatar } from '../services/auth'
import { AVATAR_MAX_BYTES, AVATAR_MIME_ALLOWLIST } from '../utils/uploadLimits'

const router = useRouter()
const name = ref(authState.user?.name ?? '')
const message = ref('')
const error = ref('')
const saving = ref(false)

const avatarInput = ref<HTMLInputElement | null>(null)
const avatarUploading = ref(false)
const avatarProgress = ref(0)
const avatarError = ref('')

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

function triggerAvatarPicker() {
  avatarInput.value?.click()
}

async function onAvatarSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0] ?? null
  input.value = ''
  if (!file) return

  avatarError.value = ''
  if (file.size > AVATAR_MAX_BYTES) {
    avatarError.value = '파일 용량은 3MB를 넘을 수 없습니다.'
    return
  }
  if (!AVATAR_MIME_ALLOWLIST.has(file.type)) {
    avatarError.value = '지원하지 않는 파일 형식입니다.'
    return
  }

  avatarUploading.value = true
  avatarProgress.value = 0
  try {
    await uploadAvatar(file, (percent) => {
      avatarProgress.value = percent
    })
  } catch (caught) {
    avatarError.value = caught instanceof Error ? caught.message : '사진을 업로드하지 못했습니다.'
  } finally {
    avatarUploading.value = false
  }
}

async function removeAvatarPhoto() {
  avatarError.value = ''
  avatarUploading.value = true
  try {
    await removeAvatar()
  } catch (caught) {
    avatarError.value = caught instanceof Error ? caught.message : '사진을 삭제하지 못했습니다.'
  } finally {
    avatarUploading.value = false
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
    <PageHeader />

    <main class="account-card">
      <h1>계정 설정</h1>
      <p class="account-description">로그인 계정과 내 정보를 관리합니다.</p>

      <div class="identity-row">
        <div class="account-avatar-wrap">
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
          <input
            ref="avatarInput"
            type="file"
            class="account-avatar-input"
            accept="image/png,image/jpeg,image/webp,image/gif"
            @change="onAvatarSelected"
          />
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
          <div class="account-avatar-actions">
            <button
              type="button"
              class="account-avatar-btn"
              :disabled="avatarUploading"
              @click="triggerAvatarPicker"
            >
              {{ avatarUploading ? `업로드 중… ${avatarProgress}%` : '사진 변경' }}
            </button>
            <button
              v-if="authState.user?.profile_image_url"
              type="button"
              class="account-avatar-btn account-avatar-btn--danger"
              :disabled="avatarUploading"
              @click="removeAvatarPhoto"
            >
              삭제
            </button>
          </div>
          <p v-if="avatarError" class="form-message form-message--error" role="alert">
            {{ avatarError }}
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
  </div>
</template>

<style scoped src="../styles/account.css"></style>

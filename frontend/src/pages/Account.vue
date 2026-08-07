<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import PageHeader from '../components/PageHeader.vue'
import { authState } from '../services/auth'
import { AccountAPI } from '../api/account'
import { AVATAR_MAX_BYTES, AVATAR_MIME_ALLOWLIST } from '../utils/uploadLimits'

const router = useRouter()
const name = ref(authState.user?.name ?? '')
const headline = ref(authState.user?.headline ?? '안녕하세요')
const linkedinUrl = ref(authState.user?.linkedin_url ?? '')
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
    await AccountAPI.update({
      name: name.value,
      headline: headline.value,
      linkedin_url: linkedinUrl.value.trim() || null,
    })
    message.value = '프로필 정보가 저장되었습니다.'
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
    await AccountAPI.uploadAvatar(file, (percent) => {
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
    await AccountAPI.removeAvatar()
  } catch (caught) {
    avatarError.value = caught instanceof Error ? caught.message : '사진을 삭제하지 못했습니다.'
  } finally {
    avatarUploading.value = false
  }
}

async function removeAccount() {
  const confirmed = window.confirm('계정과 연결된 로그인 정보가 모두 삭제됩니다. 계속하시겠습니까?')
  if (!confirmed) return

  error.value = ''
  try {
    await AccountAPI.delete()
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
      <div class="account-heading-row">
        <p class="account-description">로그인 계정과 공개 프로필 정보를 관리합니다.</p>
        <RouterLink
          v-if="authState.user"
          :to="`/profiles/${authState.user.id}`"
          class="account-public-link"
        >
          공개 프로필 보기 ↗
        </RouterLink>
      </div>

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

        <label for="account-headline">한줄 소개</label>
        <input
          id="account-headline"
          v-model="headline"
          type="text"
          minlength="1"
          maxlength="160"
          placeholder="어떤 일을 하는 사람인지 소개해 주세요."
          required
        />
        <span class="account-field-hint">공개 프로필에 표시됩니다. {{ headline.length }}/160</span>

        <label for="account-linkedin">LinkedIn 주소</label>
        <input
          id="account-linkedin"
          v-model="linkedinUrl"
          type="text"
          inputmode="url"
          maxlength="2048"
          placeholder="linkedin.com/in/username"
        />
        <span class="account-field-hint">비워두면 공개 프로필에 링크가 나타나지 않습니다.</span>

        <p v-if="message" class="form-message form-message--success" role="status">{{ message }}</p>
        <p v-if="error" class="form-message form-message--error" role="alert">{{ error }}</p>
        <button type="submit" class="primary-button" :disabled="saving">
          {{ saving ? '저장 중…' : '변경사항 저장' }}
        </button>
      </form>

      <section class="danger-zone">
        <h2>계정 삭제</h2>
        <p>
          계정과 로그인 정보가 영구적으로 삭제됩니다. 소유한 프로젝트가 있다면 먼저 소유권을
          위임하거나 프로젝트를 삭제해야 합니다.
        </p>
        <button type="button" class="danger-button" @click="removeAccount">계정 삭제</button>
      </section>
    </main>
  </div>
</template>

<style scoped src="../styles/account.css"></style>

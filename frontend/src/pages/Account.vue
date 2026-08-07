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
  <div class="account-page min-h-screen px-6 pb-8 text-gray-900 max-sm:px-3.5 max-sm:pb-6">
    <PageHeader />

    <main
      class="account-card mx-auto mb-7 max-w-170 p-9 border border-gray-200 rounded-2xl bg-white max-sm:px-5 max-sm:py-6"
    >
      <h1>계정 설정</h1>
      <div class="flex items-start justify-between gap-4 mb-7 max-sm:flex-col max-sm:gap-1">
        <p class="mt-2 text-gray-500">로그인 계정과 공개 프로필 정보를 관리합니다.</p>
        <RouterLink
          v-if="authState.user"
          :to="`/profiles/${authState.user.id}`"
          class="account-public-link shrink-0 mt-2 text-blue-600 font-bold hover:underline"
        >
          공개 프로필 보기 ↗
        </RouterLink>
      </div>

      <div class="flex items-center gap-3.5 p-4 rounded-xl bg-slate-50 max-sm:items-start">
        <div class="relative shrink-0 grow-0">
          <img
            v-if="authState.user?.profile_image_url"
            :src="authState.user.profile_image_url"
            alt=""
            class="w-12 h-12 rounded-full object-cover"
            referrerpolicy="no-referrer"
          />
          <div
            v-else
            class="w-12 h-12 rounded-full grid place-items-center bg-blue-600 text-white font-bold"
          >
            {{ authState.user?.name.charAt(0).toUpperCase() }}
          </div>
          <input
            ref="avatarInput"
            type="file"
            class="hidden"
            accept="image/png,image/jpeg,image/webp,image/gif"
            @change="onAvatarSelected"
          />
        </div>
        <div>
          <strong>{{ authState.user?.email }}</strong>
          <p class="identity-status mt-1 text-green-600">
            {{
              authState.user?.auth_provider === 'google'
                ? 'Google OAuth 연결됨'
                : '이메일 로그인 사용 중'
            }}
          </p>
          <div class="flex gap-2.5 mt-1.5">
            <button
              type="button"
              class="border-0 bg-transparent p-0 text-blue-600 text-xs font-semibold cursor-pointer disabled:cursor-default disabled:opacity-50"
              :disabled="avatarUploading"
              @click="triggerAvatarPicker"
            >
              {{ avatarUploading ? `업로드 중… ${avatarProgress}%` : '사진 변경' }}
            </button>
            <button
              v-if="authState.user?.profile_image_url"
              type="button"
              class="border-0 bg-transparent p-0 text-red-700 text-xs font-semibold cursor-pointer disabled:cursor-default disabled:opacity-50"
              :disabled="avatarUploading"
              @click="removeAvatarPhoto"
            >
              삭제
            </button>
          </div>
          <p v-if="avatarError" class="form-message text-red-700" role="alert">
            {{ avatarError }}
          </p>
        </div>
      </div>

      <form class="account-form grid gap-2.5 mt-7" @submit.prevent="saveProfile">
        <label for="account-name" class="text-sm font-bold">표시 이름</label>
        <input
          id="account-name"
          v-model="name"
          type="text"
          minlength="2"
          maxlength="80"
          required
          class="py-3 px-3.5 border border-gray-300 rounded-lg"
        />

        <label for="account-headline" class="text-sm font-bold">한줄 소개</label>
        <input
          id="account-headline"
          v-model="headline"
          type="text"
          minlength="1"
          maxlength="160"
          placeholder="어떤 일을 하는 사람인지 소개해 주세요."
          required
          class="py-3 px-3.5 border border-gray-300 rounded-lg"
        />
        <span class="account-field-hint -mt-1 text-gray-500 text-xs"
          >공개 프로필에 표시됩니다. {{ headline.length }}/160</span
        >

        <label for="account-linkedin" class="text-sm font-bold">LinkedIn 주소</label>
        <input
          id="account-linkedin"
          v-model="linkedinUrl"
          type="text"
          inputmode="url"
          maxlength="2048"
          placeholder="linkedin.com/in/username"
          class="py-3 px-3.5 border border-gray-300 rounded-lg"
        />
        <span class="account-field-hint -mt-1 text-gray-500 text-xs"
          >비워두면 공개 프로필에 링크가 나타나지 않습니다.</span
        >

        <p v-if="message" class="form-message text-green-700" role="status">{{ message }}</p>
        <p v-if="error" class="form-message text-red-700" role="alert">{{ error }}</p>
        <button
          type="submit"
          class="w-fit py-2.5 px-4 border-0 rounded-lg text-white font-bold cursor-pointer bg-blue-600 disabled:cursor-wait disabled:opacity-65"
          :disabled="saving"
        >
          {{ saving ? '저장 중…' : '변경사항 저장' }}
        </button>
      </form>

      <section class="mt-9 pt-6 border-t border-gray-200">
        <h2 class="text-lg">계정 삭제</h2>
        <p class="mt-2 mb-4 text-gray-500 text-sm">
          계정과 로그인 정보가 영구적으로 삭제됩니다. 소유한 프로젝트가 있다면 먼저 소유권을
          위임하거나 프로젝트를 삭제해야 합니다.
        </p>
        <button
          type="button"
          class="w-fit py-2.5 px-4 border-0 rounded-lg text-white font-bold cursor-pointer bg-red-600"
          @click="removeAccount"
        >
          계정 삭제
        </button>
      </section>
    </main>
  </div>
</template>

<style scoped src="../styles/account.css"></style>

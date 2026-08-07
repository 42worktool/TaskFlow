<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { authState } from '../services/auth'
import { profileModalState } from '../services/profileModal'
import { AccountAPI } from '../api/account'
import { AVATAR_MAX_BYTES, AVATAR_MIME_ALLOWLIST } from '../utils/uploadLimits'
import ProfileLink from '../components/ProfileLink.vue'

const emit = defineEmits<{
  close: []
}>()
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

function closeAccount(): void {
  emit('close')
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return
  if (profileModalState.surface && profileModalState.surface !== 'account') return
  event.preventDefault()
  event.stopImmediatePropagation()
  closeAccount()
}

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

onMounted(() => window.addEventListener('keydown', handleKeydown, true))
onBeforeUnmount(() => window.removeEventListener('keydown', handleKeydown, true))
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-[420] flex items-center justify-center overflow-y-auto bg-[rgba(17,24,39,0.28)] p-5! backdrop-blur-[2px]"
      @click.self="closeAccount"
    >
      <main
        class="relative max-h-[calc(100vh-40px)] w-full max-w-[680px] overflow-y-auto rounded-xl bg-white shadow-[0_16px_48px_rgba(17,24,39,0.22)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-dialog-title"
        @click.stop
      >
        <div class="flex items-center justify-between px-6! pt-5!">
          <h1 id="account-dialog-title" class="text-lg font-bold text-slate-900">프로필 수정</h1>
          <button
            type="button"
            class="border-0 bg-transparent text-slate-500 transition hover:text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="프로필 수정 닫기"
            @click="closeAccount"
          >
            ✕
          </button>
        </div>

        <div class="px-6! pt-5! pb-6!">
          <div class="flex items-start justify-between gap-4 max-sm:flex-col max-sm:gap-2">
            <p class="text-sm text-slate-500">로그인 계정과 공개 프로필 정보를 관리합니다.</p>
            <ProfileLink
              v-if="authState.user"
              :user-id="authState.user.id"
              class="shrink-0 text-xs font-semibold text-[#0c66e4] hover:underline"
            >
              공개 프로필 보기 ↗
            </ProfileLink>
          </div>

          <div
            class="mt-6! flex items-center gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4! max-sm:items-start"
          >
            <div class="relative shrink-0">
              <img
                v-if="authState.user?.profile_image_url"
                :src="authState.user.profile_image_url"
                alt=""
                class="h-14 w-14 rounded-full object-cover"
                referrerpolicy="no-referrer"
              />
              <div
                v-else
                class="grid h-14 w-14 place-items-center rounded-full bg-[#0c66e4] text-lg font-bold text-white"
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
            <div class="min-w-0">
              <strong class="block truncate text-sm text-slate-800">{{
                authState.user?.email
              }}</strong>
              <p class="mt-1! text-xs font-medium text-emerald-600">
                {{
                  authState.user?.auth_provider === 'google'
                    ? 'Google OAuth 연결됨'
                    : '이메일 로그인 사용 중'
                }}
              </p>
              <div class="mt-2! flex gap-3">
                <button
                  type="button"
                  class="text-xs font-semibold text-[#0c66e4] hover:underline disabled:cursor-default disabled:opacity-50"
                  :disabled="avatarUploading"
                  @click="triggerAvatarPicker"
                >
                  {{ avatarUploading ? `업로드 중… ${avatarProgress}%` : '사진 변경' }}
                </button>
                <button
                  v-if="authState.user?.profile_image_url"
                  type="button"
                  class="text-xs font-semibold text-rose-600 hover:underline disabled:cursor-default disabled:opacity-50"
                  :disabled="avatarUploading"
                  @click="removeAvatarPhoto"
                >
                  삭제
                </button>
              </div>
              <p v-if="avatarError" class="mt-2! text-xs text-rose-600" role="alert">
                {{ avatarError }}
              </p>
            </div>
          </div>

          <form class="mt-6! grid gap-2.5" @submit.prevent="saveProfile">
            <label for="account-name" class="text-sm font-semibold text-slate-700">표시 이름</label>
            <input
              id="account-name"
              v-model="name"
              type="text"
              class="rounded-lg border border-slate-300 px-3.5! py-2.5! outline-none transition focus:border-[#0c66e4] focus:ring-2 focus:ring-blue-100"
              minlength="2"
              maxlength="80"
              required
            />

            <label for="account-headline" class="mt-2! text-sm font-semibold text-slate-700"
              >한줄 소개</label
            >
            <input
              id="account-headline"
              v-model="headline"
              type="text"
              class="rounded-lg border border-slate-300 px-3.5! py-2.5! outline-none transition focus:border-[#0c66e4] focus:ring-2 focus:ring-blue-100"
              minlength="1"
              maxlength="160"
              placeholder="어떤 일을 하는 사람인지 소개해 주세요."
              required
            />
            <span class="text-xs text-slate-500"
              >공개 프로필에 표시됩니다. {{ headline.length }}/160</span
            >

            <label for="account-linkedin" class="mt-2! text-sm font-semibold text-slate-700"
              >LinkedIn 주소</label
            >
            <input
              id="account-linkedin"
              v-model="linkedinUrl"
              type="text"
              class="rounded-lg border border-slate-300 px-3.5! py-2.5! outline-none transition focus:border-[#0c66e4] focus:ring-2 focus:ring-blue-100"
              inputmode="url"
              maxlength="2048"
              placeholder="linkedin.com/in/username"
            />
            <span class="text-xs text-slate-500"
              >비워두면 공개 프로필에 링크가 나타나지 않습니다.</span
            >

            <p v-if="message" class="text-xs font-medium text-emerald-600" role="status">
              {{ message }}
            </p>
            <p v-if="error" class="text-xs font-medium text-rose-600" role="alert">{{ error }}</p>
            <button
              type="submit"
              class="mt-2! w-fit rounded-lg bg-[#0c66e4] px-4! py-2.5! text-sm font-bold text-white transition hover:bg-[#0055cc] focus:outline-none focus:ring-2 focus:ring-[#0c66e4] focus:ring-offset-2 disabled:cursor-wait disabled:opacity-60"
              :disabled="saving"
            >
              {{ saving ? '저장 중…' : '변경사항 저장' }}
            </button>
          </form>

          <section class="mt-7! border-t border-slate-200 pt-5!">
            <h2 class="text-sm font-bold text-slate-800">계정 삭제</h2>
            <div class="mt-2! flex items-center justify-between gap-4 max-sm:items-start">
              <p class="text-xs leading-5 text-slate-500">
                계정과 로그인 정보가 영구적으로 삭제됩니다. 소유한 프로젝트가 있다면 먼저 소유권을
                위임하거나 프로젝트를 삭제해야 합니다.
              </p>
              <button
                type="button"
                class="shrink-0 rounded-lg border border-rose-200 px-3! py-2! text-xs font-semibold text-rose-600 transition hover:bg-rose-50 focus:outline-none focus:ring-2 focus:ring-rose-500"
                @click="removeAccount"
              >
                계정 삭제
              </button>
            </div>
          </section>
        </div>
      </main>
    </div>
  </Teleport>
</template>

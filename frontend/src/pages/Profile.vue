<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import PageHeader from '../components/PageHeader.vue'
import { ProfileAPI, type PublicProfile } from '../api/profile'
import { authState } from '../services/auth'

const route = useRoute()
const profile = ref<PublicProfile | null>(null)
const loading = ref(true)
const error = ref('')

const isOwnProfile = computed(() =>
  Boolean(profile.value && authState.user?.id === profile.value.id),
)

const joinedAt = computed(() => {
  if (!profile.value) return ''
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'long',
  }).format(new Date(profile.value.created_at))
})

const initial = computed(() => profile.value?.name.trim().charAt(0).toUpperCase() || '?')

async function loadProfile(userId: string) {
  loading.value = true
  error.value = ''
  profile.value = null
  try {
    profile.value = await ProfileAPI.get(userId)
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : '프로필을 불러오지 못했습니다.'
  } finally {
    loading.value = false
  }
}

watch(
  () => String(route.params.userId ?? ''),
  (userId) => void loadProfile(userId),
  { immediate: true },
)
</script>

<template>
  <div class="public-profile-page">
    <PageHeader />

    <main class="public-profile-shell">
      <div v-if="loading" class="public-profile-state" role="status">프로필을 불러오는 중…</div>
      <div v-else-if="error" class="public-profile-state public-profile-state--error" role="alert">
        <strong>프로필을 표시할 수 없습니다.</strong>
        <span>{{ error }}</span>
      </div>

      <article v-else-if="profile" class="public-profile-card">
        <header class="public-profile-hero">
          <img
            v-if="profile.profile_image_url"
            :src="profile.profile_image_url"
            :alt="`${profile.name} 프로필 사진`"
            class="public-profile-avatar"
            referrerpolicy="no-referrer"
          />
          <div
            v-else
            class="public-profile-avatar public-profile-avatar--fallback"
            aria-hidden="true"
          >
            {{ initial }}
          </div>

          <div class="public-profile-identity">
            <p class="public-profile-eyebrow">PUBLIC PROFILE</p>
            <h1>{{ profile.name }}</h1>
            <p class="public-profile-headline">{{ profile.headline }}</p>
          </div>

          <RouterLink v-if="isOwnProfile" to="/account" class="public-profile-edit">
            프로필 편집
          </RouterLink>
        </header>

        <div class="public-profile-details">
          <section class="public-profile-section">
            <h2>소개</h2>
            <p>{{ profile.headline }}</p>
          </section>

          <section class="public-profile-section">
            <h2>Professional</h2>
            <a
              v-if="profile.linkedin_url"
              :href="profile.linkedin_url"
              class="public-profile-linkedin"
              target="_blank"
              rel="noopener noreferrer"
            >
              LinkedIn 프로필 보기 ↗
            </a>
            <p v-else class="public-profile-muted">등록된 Professional SNS 링크가 없습니다.</p>
          </section>

          <section class="public-profile-section public-profile-section--joined">
            <h2>TaskFlow 활동</h2>
            <p>{{ joinedAt }}부터 함께하고 있습니다.</p>
          </section>
        </div>
      </article>
    </main>
  </div>
</template>

<style scoped src="../styles/profile.css"></style>

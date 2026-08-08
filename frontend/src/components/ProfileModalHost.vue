<script setup lang="ts">
import { watch } from 'vue'
import { useRoute } from 'vue-router'
import Account from '../pages/Account.vue'
import ProfileCardModal from './ProfileCardModal.vue'
import {
  closeAccountModal,
  closeProfileModal,
  closeProfileSurface,
  profileModalState,
} from '../services/profileModal'

// 라우트와 무관하게 열리는 프로필/계정 표면을 앱 최상단에서 렌더링하고 화면 이동 시 남은 모달을 닫는다.
const route = useRoute()

watch(() => route.fullPath, closeProfileSurface)
</script>

<template>
  <ProfileCardModal
    v-if="profileModalState.surface === 'profile' && profileModalState.userId"
    :user-id="profileModalState.userId"
    @close="closeProfileModal"
  />
  <Account v-else-if="profileModalState.surface === 'account'" @close="closeAccountModal" />
</template>

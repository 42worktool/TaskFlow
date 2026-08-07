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

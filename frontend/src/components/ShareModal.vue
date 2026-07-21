<script setup lang="ts">
import { ref, computed } from 'vue'
import { workspaceMembers } from '../mock/data'

const props = defineProps<{ workspaceName: string; workspaceId: string }>()
defineEmits<{ close: [] }>()

const inviteEmail = ref('')
const inviteLink = computed(() => `taskflow.app/invite/${props.workspaceId}`)

const roleLabels: Record<string, string> = {
  OWNER: '관리자',
  EDITOR: '편집자',
  VIEWER: '뷰어',
  MEMBER: '멤버',
}
</script>

<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal">
      <div class="modal-header">
        <div>
          <h2 class="modal-title">팀원 초대</h2>
          <p class="modal-subtitle">{{ workspaceName }} · 공유 설정</p>
        </div>
        <button class="close-btn" @click="$emit('close')">✕</button>
      </div>

      <div class="section">
        <p class="section-label">이메일로 초대</p>
        <div class="invite-row">
          <input v-model="inviteEmail" class="invite-input" placeholder="이메일 주소 입력..." />
          <button class="role-btn">편집자 ▾</button>
        </div>
        <button class="send-btn">메일로 초대 보내기 (mailto:)</button>
      </div>

      <div class="section">
        <p class="section-label">초대 링크</p>
        <div class="link-row">
          <input class="link-input" :value="inviteLink" readonly />
          <button class="copy-btn">복사</button>
        </div>
      </div>

      <div class="section">
        <p class="section-label">현재 팀원</p>
        <ul class="member-list">
          <li v-for="m in workspaceMembers" :key="m.user_id" class="member-item">
            <div
              class="member-avatar"
              :style="{
                background:
                  m.role === 'OWNER' ? '#2563EB' : m.role === 'EDITOR' ? '#10B981' : '#7C3AED',
              }"
            >
              {{ m.name[0] }}
            </div>
            <div class="member-info">
              <p class="member-name">{{ m.name }}</p>
              <p class="member-email">{{ m.email }}</p>
            </div>
            <div class="member-actions">
              <span class="role-badge">{{ roleLabels[m.role] }}</span>
              <button v-if="m.role !== 'OWNER'" class="remove-btn">제거</button>
            </div>
          </li>
        </ul>
      </div>

      <div class="modal-footer">
        <button class="close-footer-btn" @click="$emit('close')">닫기</button>
      </div>
    </div>
  </div>
</template>

<style scoped src="../styles/share-modal.css"></style>

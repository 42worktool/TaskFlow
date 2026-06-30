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
          <input
            v-model="inviteEmail"
            class="invite-input"
            placeholder="이메일 주소 입력..."
          />
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
            <div class="member-avatar" :style="{ background: m.role === 'OWNER' ? '#2563EB' : m.role === 'EDITOR' ? '#10B981' : '#7C3AED' }">
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

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: #fff;
  border-radius: 12px;
  width: 480px;
  max-height: 90vh;
  overflow-y: auto;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding-bottom: 16px;
  border-bottom: 1px solid #e5e7eb;
}

.modal-title {
  font-size: 18px;
  font-weight: 700;
  color: #111827;
}

.modal-subtitle {
  font-size: 13px;
  color: #6b7280;
  margin-top: 2px;
}

.close-btn {
  background: none;
  border: none;
  font-size: 16px;
  color: #6b7280;
  cursor: pointer;
  padding: 4px;
}

.section-label {
  font-size: 13px;
  font-weight: 600;
  color: #374151;
  margin-bottom: 8px;
}

.invite-row {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
}

.invite-input {
  flex: 1;
  padding: 10px 12px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  font-size: 14px;
  color: #111827;
}

.invite-input::placeholder {
  color: #9ca3af;
}

.role-btn {
  padding: 10px 14px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  font-size: 14px;
  color: #374151;
  background: #fff;
  cursor: pointer;
  white-space: nowrap;
}

.send-btn {
  width: 100%;
  padding: 12px;
  background: #2563EB;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.send-btn:hover {
  background: #1d4ed8;
}

.link-row {
  display: flex;
  gap: 8px;
}

.link-input {
  flex: 1;
  padding: 10px 12px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  font-size: 13px;
  color: #6b7280;
  background: #f9fafb;
}

.copy-btn {
  padding: 10px 16px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  font-size: 14px;
  color: #374151;
  background: #f9fafb;
  cursor: pointer;
}

.member-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.member-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid #f3f4f6;
}

.member-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 700;
  color: #fff;
  flex-shrink: 0;
}

.member-info {
  flex: 1;
}

.member-name {
  font-size: 14px;
  font-weight: 500;
  color: #111827;
}

.member-email {
  font-size: 12px;
  color: #6b7280;
}

.member-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.role-badge {
  padding: 4px 10px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  font-size: 13px;
  color: #374151;
}

.remove-btn {
  background: none;
  border: none;
  font-size: 13px;
  color: #ef4444;
  cursor: pointer;
}

.modal-footer {
  border-top: 1px solid #e5e7eb;
  padding-top: 16px;
}

.close-footer-btn {
  width: 100%;
  padding: 12px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  font-size: 14px;
  color: #374151;
  background: #fff;
  cursor: pointer;
}

.close-footer-btn:hover {
  background: #f9fafb;
}
</style>

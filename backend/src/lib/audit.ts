export function createdBy(userId: string) {
  return {
    created_by: userId,
    updated_by: userId,
  }
}

export function updatedBy(userId: string) {
  return {
    updated_by: userId,
  }
}

export function softDeletedBy(userId: string) {
  // 실제 행을 지우지 않고 삭제 시각/행위자를 함께 기록해 감사 로그와 복구 가능성을 보존한다.
  return {
    ...updatedBy(userId),
    deleted_at: new Date(),
    deleted_by: userId,
  }
}

export function restoredBy(userId: string) {
  // 복합 PK를 쓰는 관계는 재생성 대신 기존 행의 삭제 표시를 해제한다.
  return {
    ...updatedBy(userId),
    deleted_at: null,
    deleted_by: null,
  }
}

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
  return {
    ...updatedBy(userId),
    deleted_at: new Date(),
    deleted_by: userId,
  }
}

export function restoredBy(userId: string) {
  return {
    ...updatedBy(userId),
    deleted_at: null,
    deleted_by: null,
  }
}

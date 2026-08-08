// Prisma 레이블 행을 API가 사용하는 공개 필드와 날짜 문자열로 변환한다.
import type { Label } from '@prisma/client'

export function toLabelDto(label: Label) {
  return {
    id: label.id,
    workspace_id: label.workspace_id,
    label_name: label.label_name,
    label_color: label.label_color,
    created_at: label.created_at,
  }
}

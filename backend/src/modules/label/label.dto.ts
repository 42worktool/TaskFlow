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

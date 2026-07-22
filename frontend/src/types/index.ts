export type UUID = string
export type ISODateString = string
export type Role = 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER'

export interface WorkspaceMember {
  user_id: UUID
  role: Role
  user: {
    id: UUID
    name: string
    email: string
    profile_image_url: string | null
  }
}

export interface Workspace {
  id: UUID
  name: string
  is_public: boolean
  created_at: ISODateString
  updated_at: ISODateString
  members: WorkspaceMember[]
}

/** Derive a stable color from a workspace id for the card color bar. */
export function workspaceColor(_wsId: UUID): string {
  const COLORS = ['#2563EB', '#EF4444', '#F59E0B', '#10B981', '#7C3AED', '#0EA5E9']
  let hash = 0
  for (let i = 0; i < _wsId.length; i++) {
    hash = (_wsId.charCodeAt(i) + ((hash << 5) - hash)) | 0
  }
  return COLORS[Math.abs(hash) % COLORS.length]
}

export interface List {
  id: UUID
  workspace_id: UUID
  name: string
  sequence: number
}

export interface Card {
  id: UUID
  list_id: UUID | null
  title: string
  description: string | null
  start_at: ISODateString | null
  deadline: ISODateString | null
  sequence: number
  created_at: ISODateString
  label?: string
  label_color?: string
}

export interface Notification {
  id: UUID
  text: string
  time: string
  read: boolean
  avatar?: string
  avatar_color?: string
}

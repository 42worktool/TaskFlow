export type UUID = string
export type ISODateString = string
export type Role = 'OWNER' | 'EDITOR' | 'VIEWER' | 'MEMBER'

export interface WorkspaceMember {
  user_id: UUID
  name: string
  email: string
  profile_image_url: string | null
  role: Role
}

export interface Workspace {
  id: UUID
  name: string
  is_public: boolean
  member_count: number
  color: string
  created_at: ISODateString
  updated_at: ISODateString
  members?: WorkspaceMember[]
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

type UUID = string
type ISODateString = string
export type WorkspaceRole = 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER'

export interface WorkspaceMember {
  user_id: UUID
  role: WorkspaceRole
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

export interface CardDetailMember {
  user_id: UUID
  name: string
  profile_image_url: string | null
}

export interface CardDetailLabel {
  label_id: UUID
  label_name: string
  label_color: string
}

export interface CardAttachment {
  id: UUID
  card_id: UUID
  file_url: string | null
  file_name: string | null
  created_at: ISODateString
}

export interface CardDetail extends Card {
  members: CardDetailMember[]
  labels: CardDetailLabel[]
  attachments: CardAttachment[]
}

export interface ListWithCards extends List {
  cards: Card[]
}

/** Payload shape emitted by vuedraggable's `change` event. */
export interface DraggableChange {
  added?: { element: { id: string }; newIndex: number }
  moved?: { element: { id: string }; newIndex: number }
}

export type NotificationCategory = 'MENTION' | 'UPDATE'
export type NotificationKind = 'workspace.member_joined'

export interface NotificationEvent {
  id: UUID
  category: NotificationCategory
  kind: NotificationKind
  text: string
  created_at: ISODateString
  workspace_id: UUID
  actor: {
    user_id: UUID
    name: string
    profile_image_url: string | null
  }
}

export interface Notification extends NotificationEvent {
  read: boolean
}

export interface Friend {
  id: UUID
  name: string
  profile_image_url: string | null
  friends_since: ISODateString
  online: boolean
}

export interface FriendPresenceEvent {
  user_id: UUID
  online: boolean
}

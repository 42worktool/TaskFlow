type UUID = string
type ISODateString = string
export type WorkspaceRole = 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER'

export interface WorkspaceMember {
  user_id: UUID
  role: WorkspaceRole
  user: {
    id: UUID
    name: string
    email?: string
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

export interface WorkspaceChangedEvent {
  event_id: UUID
  workspace_id: UUID
  entity: 'workspace' | 'member' | 'list' | 'card'
  action: 'created' | 'updated' | 'deleted' | 'moved'
  entity_id: UUID
  list_ids: UUID[]
  actor_user_id: UUID
  occurred_at: ISODateString
}

export interface WorkspaceMemberPresenceEvent {
  workspace_id: UUID
  user_id: UUID
  online: boolean
}

export interface WorkspaceMessage {
  id: UUID
  workspace_id: UUID
  card_id: UUID | null
  content: string
  created_at: ISODateString
  author: {
    user_id: UUID
    name: string
    profile_image_url: string | null
  }
}

export interface DirectMessage {
  id: UUID
  content: string
  created_at: ISODateString
  author: {
    user_id: UUID
    name: string
    profile_image_url: string | null
  }
  recipient: {
    user_id: UUID
    name: string
    profile_image_url: string | null
  }
}

export interface WorkspaceSubscriptionResult {
  workspace_id: UUID
  online_user_ids: UUID[]
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

export interface Label {
  id: UUID
  workspace_id: UUID
  label_name: string
  label_color: string
  created_at: ISODateString
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
  is_completed: boolean
  sequence: number
  created_at: ISODateString
  labels?: CardDetailLabel[]
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
  mime_type: string | null
  size_bytes: number | null
  created_at: ISODateString
}

export interface CardComment {
  id: UUID
  card_id: UUID
  author: {
    user_id: UUID
    name: string
    profile_image_url: string | null
  }
  comment_str: string
  created_at: ISODateString
  updated_at: ISODateString
}

export interface CardDetail extends Omit<Card, 'labels'> {
  labels: CardDetailLabel[]
  attachments: CardAttachment[]
  comments: CardComment[]
}

export interface ListWithCards extends List {
  cards: Card[]
}

/** Payload shape emitted by vuedraggable's `change` event. */
export interface DraggableChange<T extends { id: string } = { id: string }> {
  added?: { element: T; newIndex: number }
  moved?: { element: T; oldIndex: number; newIndex: number }
  removed?: { element: T; oldIndex: number }
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

export interface Friend {
  id: UUID
  name: string
  profile_image_url: string | null
  friends_since: ISODateString
  online: boolean
}

export interface FriendRequest {
  id: UUID
  name: string
  profile_image_url: string | null
  requested_at: ISODateString
}

export interface FriendRequestLists {
  incoming: FriendRequest[]
  outgoing: FriendRequest[]
}

export interface FriendPresenceEvent {
  user_id: UUID
  online: boolean
}

export interface FriendUserIdEvent {
  user_id: UUID
}

export interface DashboardSummary {
  current_total: number
  current_done: number
  current_not_done: number
  created_in_period: number
  completed_in_period: number
  reopened_in_period: number
  activity_in_period: number
  completion_rate: number
  has_cards: boolean
}

export type DashboardPeriod = 7 | 30 | 90 | 365

export interface DashboardDailyActivity {
  date: string
  count: number
  log_count: number
}

export interface DashboardDailyFlow {
  date: string
  created: number
  completed: number
  reopened: number
}

export interface DashboardListStatus {
  list_id: UUID
  name: string
  card_count: number
  completed_card_count: number
}

export type DashboardTargetType =
  | 'WORKSPACE'
  | 'MEMBER'
  | 'LIST'
  | 'CARD'
  | 'COMMENT'

export interface DashboardActivityBreakdown {
  target_type: DashboardTargetType
  count: number
}

export type DashboardActivityEventType =
  | 'WORKSPACE_UPDATED'
  | 'WORKSPACE_DELETED'
  | 'MEMBER_ADDED'
  | 'MEMBER_REMOVED'
  | 'MEMBER_ROLE_CHANGED'
  | 'LIST_CREATED'
  | 'LIST_UPDATED'
  | 'LIST_MOVED'
  | 'LIST_DELETED'
  | 'CARD_CREATED'
  | 'CARD_UPDATED'
  | 'CARD_MOVED'
  | 'CARD_COMPLETED'
  | 'CARD_REOPENED'
  | 'CARD_DELETED'
  | 'COMMENT_CREATED'
  | 'COMMENT_UPDATED'
  | 'COMMENT_DELETED'

export interface DashboardRecentActivity {
  event_type: DashboardActivityEventType
  target_type: DashboardTargetType
  operation: 'INSERT' | 'UPDATE' | 'DELETE'
  target_id: string
  created_at: ISODateString
  actor: {
    user_id: UUID
    name: string
    profile_image_url: string | null
  } | null
}

export interface WorkspaceDashboard {
  generated_at: ISODateString
  period_days: DashboardPeriod
  summary: DashboardSummary
  daily_activity: DashboardDailyActivity[]
  daily_flow: DashboardDailyFlow[]
  lists: DashboardListStatus[]
  activity_breakdown: DashboardActivityBreakdown[]
  recent_activity: DashboardRecentActivity[]
}

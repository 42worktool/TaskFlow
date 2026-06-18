export type User = {
  id: string
  name: string
  email: string
}

export type WorkspaceMember = {
  id: string
  workspaceId: string
  userId: string
  role: 'OWNER' | 'MEMBER'
}

export type Workspace = {
  id: string
  title: string
}

export type Board = {
  id: string
  title: string
  workspaceId: string
}

export type BoardList = {
  id: string
  boardId: string
  title: string
}

export type CardLocation = { type: 'list'; listId: string } | { type: 'inbox'; userId: string }

export type Card = {
  id: string
  location: CardLocation
  title: string
  description: string
}

import type { User, Workspace, WorkspaceMember, Board, BoardList, Card } from './type.ts'

export const mockUsers: User[] = [
  {
    id: 'user-1',
    name: 'hoshino',
    email: 'hoshino@example.com',
  },
  {
    id: 'user-2',
    name: 'kokona',
    email: 'kokona@example.com',
  },
]

export const mockWorkspaces: Workspace[] = [
  {
    id: 'workspace-1',
    title: 'ft_transcendence',
  },
]

export const mockWorkspaceMembers: WorkspaceMember[] = [
  {
    id: 'workspace-member-1',
    workspaceId: 'workspace-1',
    userId: 'user-1',
    role: 'OWNER',
  },
  {
    id: 'workspace-member-2',
    workspaceId: 'workspace-1',
    userId: 'user-2',
    role: 'MEMBER',
  },
]

export const mockBoards: Board[] = [
  {
    id: 'board-1',
    workspaceId: 'workspace-1',
    title: 'Collaboration tool development',
  },
]

export const mockBoardLists: BoardList[] = [
  {
    id: 'list-todo',
    boardId: 'board-1',
    title: 'Todo',
  },
  {
    id: 'list-progress',
    boardId: 'board-1',
    title: 'In Progress',
  },
  {
    id: 'list-done',
    boardId: 'board-1',
    title: 'Done',
  },
]

export const mockCards: Card[] = [
  {
    id: 'card-1',
    location: { type: 'list', listId: 'list-todo' },
    title: 'Login page',
    description: 'Create email/password input and OAuth UI',
  },
  {
    id: 'card-2',
    location: { type: 'list', listId: 'list-progress' },
    title: 'Board layout',
    description: 'Display list and cards',
  },
  {
    id: 'card-3',
    location: { type: 'list', listId: 'list-done' },
    title: 'Frontend development server',
    description: 'run `npm run dev`',
  },
  {
    id: 'card-4',
    location: { type: 'inbox', userId: 'user-1' },
    title: 'OAuth button design',
    description: 'Naver/Kakao',
  },
]

export function getListsByBoardId(boardId: string): BoardList[] {
  return mockBoardLists.filter((list) => list.boardId === boardId)
}

export function getCardsByListId(listId: string): Card[] {
  return mockCards.filter(
    (card) => card.location.type === 'list' && card.location.listId === listId,
  )
}

export function getInboxCardsByUserId(userId: string): Card[] {
  return mockCards.filter(
    (card) => card.location.type === 'inbox' && card.location.userId === userId,
  )
}

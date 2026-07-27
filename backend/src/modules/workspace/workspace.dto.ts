import type { Role, User, Workspace, WorkspaceMember } from '@prisma/client'

export const workspaceInclude = {
  members: {
    where: { deleted_at: null },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          profile_image_url: true,
        },
      },
    },
  },
} as const

export type WorkspaceWithMembers = Workspace & {
  members: (WorkspaceMember & {
    user: Pick<User, 'id' | 'name' | 'email' | 'profile_image_url'>
  })[]
}

export function toWorkspaceDto(workspace: WorkspaceWithMembers) {
  return {
    id: workspace.id,
    name: workspace.name,
    is_public: workspace.is_public,
    created_at: workspace.created_at.toISOString(),
    updated_at: workspace.updated_at.toISOString(),
    members: workspace.members.map((member) => ({
      user_id: member.user_id,
      role: member.role as Role,
      user: {
        id: member.user.id,
        name: member.user.name,
        email: member.user.email,
        profile_image_url: member.user.profile_image_url,
      },
    })),
  }
}

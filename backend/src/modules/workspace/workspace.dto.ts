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

type WorkspaceWithMembers = Workspace & {
  members: (WorkspaceMember & {
    user: Pick<User, 'id' | 'name' | 'email' | 'profile_image_url'>
  })[]
}

export function toWorkspaceDto(
  workspace: WorkspaceWithMembers,
  options: { includeMemberEmail: boolean },
) {
  // 공개 워크스페이스를 둘러보는 비회원에게는 멤버 이메일을 숨기고,
  // 활성 멤버가 조회할 때만 협업에 필요한 이메일을 포함한다.
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
        ...(options.includeMemberEmail ? { email: member.user.email } : {}),
        profile_image_url: member.user.profile_image_url,
      },
    })),
  }
}

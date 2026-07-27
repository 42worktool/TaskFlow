import { z } from 'zod'

export const workspaceRoleSchema = z.enum(['ADMIN', 'MEMBER', 'VIEWER'])

export const createWorkspaceSchema = z.object({
  name: z.string().min(1).max(100),
  is_public: z.boolean().optional().default(false),
})

export const updateWorkspaceSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    is_public: z.boolean().optional(),
  })
  .refine((value) => value.name !== undefined || value.is_public !== undefined, {
    message: 'either name or is_public is required',
  })

export const inviteWorkspaceMemberSchema = z.object({
  email: z.string().email().max(254),
  role: workspaceRoleSchema,
})

export const changeWorkspaceRoleSchema = z.object({
  role: workspaceRoleSchema,
})

export type CreateWorkspaceBody = z.infer<typeof createWorkspaceSchema>
export type UpdateWorkspaceBody = z.infer<typeof updateWorkspaceSchema>
export type InviteWorkspaceMemberBody = z.infer<typeof inviteWorkspaceMemberSchema>

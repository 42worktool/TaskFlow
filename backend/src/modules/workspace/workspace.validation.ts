import { z } from 'zod'
import { normalizedEmailSchema, uuidSchema } from '../../lib/validation'

export const workspaceRoleSchema = z.enum(['ADMIN', 'MEMBER', 'VIEWER'])

export const workspaceInvitationTokenSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{43}$/)

export const workspaceInvitationSchema = z.object({
  workspaceId: uuidSchema,
  role: workspaceRoleSchema,
})

export type WorkspaceInvitation = z.infer<typeof workspaceInvitationSchema>

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
  email: normalizedEmailSchema,
  role: workspaceRoleSchema,
})

export const changeWorkspaceRoleSchema = z.object({
  role: workspaceRoleSchema,
})

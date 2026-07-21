import { z } from "zod";

export const createWorkspaceSchema = z.object({
  name: z.string().trim().min(1, "Workspace name required").max(100, "Name too long"),
  isPublic: z.boolean().optional().default(false),
});

export const updateWorkspaceSchema = z.object({
  name: z.string().trim().min(1, "Workspace name required").max(100).optional(),
  isPublic: z.boolean().optional(),
});

export const inviteMemberSchema = z.object({
  email: z.string().trim().email("Valid email required"),
  role: z.enum(["OWNER", "ADMIN", "MEMBER", "VIEWER"]).optional().default("MEMBER"),
});

export const updateMemberSchema = z.object({
  role: z.enum(["ADMIN", "MEMBER", "VIEWER"]),
});

export type CreateWorkspace = z.infer<typeof createWorkspaceSchema>;
export type UpdateWorkspace = z.infer<typeof updateWorkspaceSchema>;
export type InviteMember = z.infer<typeof inviteMemberSchema>;
export type UpdateMember = z.infer<typeof updateMemberSchema>;
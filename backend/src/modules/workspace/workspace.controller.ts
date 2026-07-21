import type { Request, Response, NextFunction } from "express";
import { asyncHandler, ApiError } from "../../utils/http";
import { assertWorkspaceMember } from "../board/workspaceGuard";
import { inviteMemberSchema, updateMemberSchema, updateWorkspaceSchema } from "./workspace.schema";
import * as workspaceService from "./workspace.service";

function actorId(req: Request): string {
  if (!req.user?.id) throw ApiError.unauthorized();
  return req.user.id;
}

function param(req: Request, key: string): string {
  const v = req.params[key];
  if (typeof v !== "string" || v.length === 0) throw ApiError.badRequest("BAD_REQUEST", `Missing ${key}`);
  return v;
}

export const workspaceController = {
  create: asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const workspace = await workspaceService.createWorkspace(req.body, actorId(req));
    res.status(201).json(workspace);
  }),

  list: asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const workspaces = await workspaceService.getWorkspaces(actorId(req));
    res.status(200).json({ myWorkspaces: workspaces, publicWorkspaces: workspaces.filter(w => w.is_public) });
  }),

  get: asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const workspaceId = param(req, "workspace_id");
    const workspace = await workspaceService.getWorkspace(workspaceId, actorId(req));
    res.status(200).json(workspace);
  }),

  update: asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const workspaceId = param(req, "workspace_id");
    const { role } = await assertWorkspaceMember(workspaceId, actorId(req), "ADMIN");
    const parsed = updateWorkspaceSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid body");
    }
    const workspace = await workspaceService.updateWorkspace(workspaceId, parsed.data, actorId(req), role);
    res.status(200).json(workspace);
  }),

  remove: asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const workspaceId = param(req, "workspace_id");
    const { role } = await assertWorkspaceMember(workspaceId, actorId(req), "OWNER");
    await workspaceService.deleteWorkspace(workspaceId, actorId(req), role);
    res.status(200).json({ ok: true });
  }),

  inviteMember: asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const workspaceId = param(req, "workspace_id");
    const { role } = await assertWorkspaceMember(workspaceId, actorId(req), "ADMIN");
    const parsed = inviteMemberSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid body");
    }
    const result = await workspaceService.inviteMember(workspaceId, parsed.data.email, parsed.data.role!, role);
    res.status(200).json(result);
  }),

  updateMember: asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const workspaceId = param(req, "workspace_id");
    const targetUserId = param(req, "user_id");
    const { role } = await assertWorkspaceMember(workspaceId, actorId(req), "ADMIN");
    const parsed = updateMemberSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid body");
    }
    const result = await workspaceService.updateMember(workspaceId, targetUserId, parsed.data.role, role);
    res.status(200).json(result);
  }),

  removeMember: asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const workspaceId = param(req, "workspace_id");
    const targetUserId = param(req, "user_id");
    const { role } = await assertWorkspaceMember(workspaceId, actorId(req), "ADMIN");
    await workspaceService.removeMember(workspaceId, targetUserId, role);
    res.status(200).json({ ok: true });
  }),
};
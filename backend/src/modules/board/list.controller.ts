import type { Request, Response, NextFunction } from "express";
import { asyncHandler, ApiError } from "../../utils/http";
import { listService } from "./list.service";
import {
  createListSchema,
  updateListSchema,
  reorderListSchema,
} from "./list.schema";

function actorId(req: Request): string {
  if (!req.user?.id) throw ApiError.unauthorized();
  return req.user.id;
}

function param(req: Request, key: string): string {
  const v = req.params[key];
  if (typeof v !== "string" || v.length === 0) throw ApiError.badRequest("BAD_REQUEST", `Missing ${key}`);
  return v;
}

export const listController = {
  create: asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const workspaceId = param(req, "workspace_id");
    const parsed = createListSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid body");
    }
    const list = await listService.create(workspaceId, parsed.data.name, actorId(req));
    res.status(201).json(list);
  }),

  update: asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const listId = param(req, "list_id");
    const parsed = updateListSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid body");
    }
    const list = await listService.update(listId, parsed.data.name, actorId(req));
    res.status(200).json(list);
  }),

  remove: asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const listId = param(req, "list_id");
    await listService.remove(listId, actorId(req));
    res.status(204).end();
  }),

  reorder: asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const listId = param(req, "list_id");
    const parsed = reorderListSchema.safeParse({
      before_list_id: req.body.before_list_id,
      after_list_id: req.body.after_list_id,
    });
    if (!parsed.success) {
      throw ApiError.badRequest("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid body");
    }
    const list = await listService.reorder(listId, parsed.data, actorId(req));
    res.status(200).json(list);
  }),
};

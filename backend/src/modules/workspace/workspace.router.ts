import { Router } from "express";
import { workspaceController } from "./workspace.controller";

export const workspaceRouter = Router();

workspaceRouter.post("/", workspaceController.create);
workspaceRouter.get("/", workspaceController.list);
workspaceRouter.get("/:workspace_id", workspaceController.get);
workspaceRouter.put("/:workspace_id", workspaceController.update);
workspaceRouter.delete("/:workspace_id", workspaceController.remove);
workspaceRouter.post("/:workspace_id/members", workspaceController.inviteMember);
workspaceRouter.put("/:workspace_id/members/:user_id", workspaceController.updateMember);
workspaceRouter.delete("/:workspace_id/members/:user_id", workspaceController.removeMember);
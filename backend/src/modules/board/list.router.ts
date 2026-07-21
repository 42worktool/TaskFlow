import { Router } from "express";
import { listController } from "./list.controller";

export const listRouter = Router();

// Nested under /api/workspaces/:workspace_id
listRouter.post("/:workspace_id/lists", listController.create);

// Top-level under /api (mounted directly)
export const listItemRouter = Router();
listItemRouter.put("/:list_id", listController.update);
listItemRouter.delete("/:list_id", listController.remove);
listItemRouter.patch("/:list_id/order", listController.reorder);

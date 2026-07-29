CREATE TABLE "WorkspaceMessages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceMessages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WorkspaceMessages_workspace_id_created_at_idx"
ON "WorkspaceMessages"("workspace_id", "created_at");

ALTER TABLE "WorkspaceMessages"
ADD CONSTRAINT "WorkspaceMessages_workspace_id_fkey"
FOREIGN KEY ("workspace_id") REFERENCES "Workspaces"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkspaceMessages"
ADD CONSTRAINT "WorkspaceMessages_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "Users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

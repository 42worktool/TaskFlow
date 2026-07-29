ALTER TABLE "WorkspaceMessages"
ADD COLUMN "card_id" UUID;

CREATE INDEX "WorkspaceMessages_card_id_idx"
ON "WorkspaceMessages"("card_id");

ALTER TABLE "WorkspaceMessages"
ADD CONSTRAINT "WorkspaceMessages_card_id_fkey"
FOREIGN KEY ("card_id") REFERENCES "Cards"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

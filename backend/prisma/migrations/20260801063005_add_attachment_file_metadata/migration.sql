-- AlterTable
ALTER TABLE "Attachments" ADD COLUMN     "mime_type" VARCHAR(127),
ADD COLUMN     "size_bytes" INTEGER,
ADD COLUMN     "storage_key" VARCHAR(255);

-- RenameIndex
ALTER INDEX "DirectMessages_recipient_user_id_sender_user_id_created_at_id_i" RENAME TO "DirectMessages_recipient_user_id_sender_user_id_created_at__idx";

-- RenameIndex
ALTER INDEX "DirectMessages_sender_user_id_recipient_user_id_created_at_id_i" RENAME TO "DirectMessages_sender_user_id_recipient_user_id_created_at__idx";

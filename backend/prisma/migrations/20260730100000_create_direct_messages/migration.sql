CREATE TABLE "DirectMessages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sender_user_id" UUID NOT NULL,
    "recipient_user_id" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DirectMessages_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "DirectMessages_distinct_participants_check"
      CHECK ("sender_user_id" <> "recipient_user_id")
);

CREATE INDEX "DirectMessages_sender_user_id_recipient_user_id_created_at_id_idx"
ON "DirectMessages"(
    "sender_user_id",
    "recipient_user_id",
    "created_at",
    "id"
);

CREATE INDEX "DirectMessages_recipient_user_id_sender_user_id_created_at_id_idx"
ON "DirectMessages"(
    "recipient_user_id",
    "sender_user_id",
    "created_at",
    "id"
);

ALTER TABLE "DirectMessages"
ADD CONSTRAINT "DirectMessages_sender_user_id_fkey"
FOREIGN KEY ("sender_user_id") REFERENCES "Users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DirectMessages"
ADD CONSTRAINT "DirectMessages_recipient_user_id_fkey"
FOREIGN KEY ("recipient_user_id") REFERENCES "Users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

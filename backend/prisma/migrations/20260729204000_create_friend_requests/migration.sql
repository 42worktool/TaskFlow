CREATE TABLE "FriendRequests" (
    "user_low_id" UUID NOT NULL,
    "user_high_id" UUID NOT NULL,
    "requested_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FriendRequests_pkey"
      PRIMARY KEY ("user_low_id", "user_high_id"),
    CONSTRAINT "FriendRequests_canonical_pair_check"
      CHECK ("user_low_id" < "user_high_id"),
    CONSTRAINT "FriendRequests_sender_is_participant_check"
      CHECK (
        "requested_by_id" = "user_low_id"
        OR "requested_by_id" = "user_high_id"
      )
);

CREATE INDEX "FriendRequests_user_high_id_idx"
ON "FriendRequests"("user_high_id");

ALTER TABLE "FriendRequests"
ADD CONSTRAINT "FriendRequests_user_low_id_fkey"
FOREIGN KEY ("user_low_id") REFERENCES "Users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FriendRequests"
ADD CONSTRAINT "FriendRequests_user_high_id_fkey"
FOREIGN KEY ("user_high_id") REFERENCES "Users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

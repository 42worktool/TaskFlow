CREATE TABLE "Friendships" (
    "user_low_id" UUID NOT NULL,
    "user_high_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Friendships_pkey" PRIMARY KEY ("user_low_id", "user_high_id"),
    CONSTRAINT "Friendships_canonical_pair_check"
      CHECK ("user_low_id" < "user_high_id")
);

CREATE INDEX "Friendships_user_high_id_idx"
ON "Friendships"("user_high_id");

ALTER TABLE "Friendships"
ADD CONSTRAINT "Friendships_user_low_id_fkey"
FOREIGN KEY ("user_low_id") REFERENCES "Users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Friendships"
ADD CONSTRAINT "Friendships_user_high_id_fkey"
FOREIGN KEY ("user_high_id") REFERENCES "Users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

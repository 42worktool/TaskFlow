-- Every persisted domain table exposes the same audit metadata contract.
-- Actor columns intentionally have no foreign keys so account deletion does
-- not erase the identity recorded by the audit/activity system.
--
-- IF NOT EXISTS keeps this migration compatible with the activity logger and
-- trigger branches, which may already have introduced a subset of the fields.

ALTER TABLE "Users"
    ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN IF NOT EXISTS "created_by" UUID,
    ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN IF NOT EXISTS "updated_by" UUID,
    ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMPTZ(3),
    ADD COLUMN IF NOT EXISTS "deleted_by" UUID;

ALTER TABLE "OAuthAccounts"
    ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN IF NOT EXISTS "created_by" UUID,
    ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN IF NOT EXISTS "updated_by" UUID,
    ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMPTZ(3),
    ADD COLUMN IF NOT EXISTS "deleted_by" UUID;

ALTER TABLE "Workspaces"
    ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN IF NOT EXISTS "created_by" UUID,
    ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN IF NOT EXISTS "updated_by" UUID,
    ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMPTZ(3),
    ADD COLUMN IF NOT EXISTS "deleted_by" UUID;

ALTER TABLE "WorkspaceMembers"
    ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN IF NOT EXISTS "created_by" UUID,
    ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN IF NOT EXISTS "updated_by" UUID,
    ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMPTZ(3),
    ADD COLUMN IF NOT EXISTS "deleted_by" UUID;

ALTER TABLE "Lists"
    ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN IF NOT EXISTS "created_by" UUID,
    ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN IF NOT EXISTS "updated_by" UUID,
    ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMPTZ(3),
    ADD COLUMN IF NOT EXISTS "deleted_by" UUID;

ALTER TABLE "Cards"
    ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN IF NOT EXISTS "created_by" UUID,
    ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN IF NOT EXISTS "updated_by" UUID,
    ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMPTZ(3),
    ADD COLUMN IF NOT EXISTS "deleted_by" UUID;

ALTER TABLE "CardMembers"
    ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN IF NOT EXISTS "created_by" UUID,
    ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN IF NOT EXISTS "updated_by" UUID,
    ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMPTZ(3),
    ADD COLUMN IF NOT EXISTS "deleted_by" UUID;

ALTER TABLE "Labels"
    ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN IF NOT EXISTS "created_by" UUID,
    ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN IF NOT EXISTS "updated_by" UUID,
    ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMPTZ(3),
    ADD COLUMN IF NOT EXISTS "deleted_by" UUID;

ALTER TABLE "CardLabels"
    ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN IF NOT EXISTS "created_by" UUID,
    ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN IF NOT EXISTS "updated_by" UUID,
    ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMPTZ(3),
    ADD COLUMN IF NOT EXISTS "deleted_by" UUID;

ALTER TABLE "Attachments"
    ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN IF NOT EXISTS "created_by" UUID,
    ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN IF NOT EXISTS "updated_by" UUID,
    ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMPTZ(3),
    ADD COLUMN IF NOT EXISTS "deleted_by" UUID;

ALTER TABLE "Comments"
    ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN IF NOT EXISTS "created_by" UUID,
    ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN IF NOT EXISTS "updated_by" UUID,
    ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMPTZ(3),
    ADD COLUMN IF NOT EXISTS "deleted_by" UUID;

-- Existing nullable updated_at values (Labels and Comments in the initial
-- schema) are backfilled before the common NOT NULL contract is enforced.
DO $$
DECLARE
    target_table TEXT;
BEGIN
    FOREACH target_table IN ARRAY ARRAY[
        'Users',
        'OAuthAccounts',
        'Workspaces',
        'WorkspaceMembers',
        'Lists',
        'Cards',
        'CardMembers',
        'Labels',
        'CardLabels',
        'Attachments',
        'Comments'
    ]
    LOOP
        EXECUTE format(
            'UPDATE %I
             SET "updated_at" = COALESCE("updated_at", "created_at", CURRENT_TIMESTAMP)
             WHERE "updated_at" IS NULL',
            target_table
        );
        EXECUTE format(
            'ALTER TABLE %I
                 ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP,
                 ALTER COLUMN "created_at" SET NOT NULL,
                 ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP,
                 ALTER COLUMN "updated_at" SET NOT NULL',
            target_table
        );
    END LOOP;
END;
$$;

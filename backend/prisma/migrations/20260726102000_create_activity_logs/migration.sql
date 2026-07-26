-- ActivityLogs is an append-only workspace activity feed populated by
-- PostgreSQL triggers. It intentionally has no foreign keys so history remains
-- readable after an actor or source row is deleted.

CREATE TYPE "ActivityOperation" AS ENUM (
    'INSERT',
    'UPDATE',
    'DELETE'
);

CREATE TYPE "ActivityEventType" AS ENUM (
    'WORKSPACE_CREATED',
    'WORKSPACE_UPDATED',
    'WORKSPACE_DELETED',
    'MEMBER_ADDED',
    'MEMBER_REMOVED',
    'MEMBER_ROLE_CHANGED',
    'LIST_CREATED',
    'LIST_UPDATED',
    'LIST_MOVED',
    'LIST_DELETED',
    'CARD_CREATED',
    'CARD_UPDATED',
    'CARD_MOVED',
    'CARD_COMPLETED',
    'CARD_REOPENED',
    'CARD_DELETED',
    'COMMENT_CREATED',
    'COMMENT_UPDATED',
    'COMMENT_DELETED'
);

CREATE TYPE "ActivityTargetType" AS ENUM (
    'WORKSPACE',
    'MEMBER',
    'LIST',
    'CARD',
    'COMMENT'
);

CREATE TABLE "ActivityLogs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "actor_user_id" UUID,
    "operation" "ActivityOperation" NOT NULL,
    "event_type" "ActivityEventType" NOT NULL,
    "target_type" "ActivityTargetType" NOT NULL,
    "target_id" TEXT NOT NULL,
    "transaction_id" BIGINT NOT NULL DEFAULT txid_current(),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLogs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ActivityLogs_workspace_id_created_at_idx"
    ON "ActivityLogs"("workspace_id", "created_at");

CREATE INDEX "ActivityLogs_actor_user_id_created_at_idx"
    ON "ActivityLogs"("actor_user_id", "created_at");

CREATE INDEX "ActivityLogs_workspace_id_event_type_created_at_idx"
    ON "ActivityLogs"("workspace_id", "event_type", "created_at");

CREATE INDEX "ActivityLogs_transaction_id_idx"
    ON "ActivityLogs"("transaction_id");

ALTER TABLE "Lists"
    ADD COLUMN "is_done" BOOLEAN NOT NULL DEFAULT false;

-- A logical deletion must always identify its actor. These constraints are
-- intentionally limited to the five activity-feed targets.
ALTER TABLE "Workspaces"
    ADD CONSTRAINT "Workspaces_deleted_audit_pair_check"
    CHECK (
        ("deleted_at" IS NULL AND "deleted_by" IS NULL)
        OR ("deleted_at" IS NOT NULL AND "deleted_by" IS NOT NULL)
    );

ALTER TABLE "WorkspaceMembers"
    ADD CONSTRAINT "WorkspaceMembers_deleted_audit_pair_check"
    CHECK (
        ("deleted_at" IS NULL AND "deleted_by" IS NULL)
        OR ("deleted_at" IS NOT NULL AND "deleted_by" IS NOT NULL)
    );

ALTER TABLE "Lists"
    ADD CONSTRAINT "Lists_deleted_audit_pair_check"
    CHECK (
        ("deleted_at" IS NULL AND "deleted_by" IS NULL)
        OR ("deleted_at" IS NOT NULL AND "deleted_by" IS NOT NULL)
    );

ALTER TABLE "Cards"
    ADD CONSTRAINT "Cards_deleted_audit_pair_check"
    CHECK (
        ("deleted_at" IS NULL AND "deleted_by" IS NULL)
        OR ("deleted_at" IS NOT NULL AND "deleted_by" IS NOT NULL)
    );

ALTER TABLE "Comments"
    ADD CONSTRAINT "Comments_deleted_audit_pair_check"
    CHECK (
        ("deleted_at" IS NULL AND "deleted_by" IS NULL)
        OR ("deleted_at" IS NOT NULL AND "deleted_by" IS NOT NULL)
    );

CREATE INDEX "Workspaces_deleted_at_idx"
    ON "Workspaces"("deleted_at");
CREATE INDEX "WorkspaceMembers_workspace_id_deleted_at_idx"
    ON "WorkspaceMembers"("workspace_id", "deleted_at");
CREATE INDEX "WorkspaceMembers_user_id_deleted_at_idx"
    ON "WorkspaceMembers"("user_id", "deleted_at");
CREATE INDEX "Lists_workspace_id_deleted_at_idx"
    ON "Lists"("workspace_id", "deleted_at");
CREATE INDEX "Cards_list_id_deleted_at_idx"
    ON "Cards"("list_id", "deleted_at");
CREATE INDEX "Comments_card_id_deleted_at_idx"
    ON "Comments"("card_id", "deleted_at");

-- Return only changed field names. The result is used only to suppress audit-
-- only updates; no changed values are persisted in ActivityLogs.
CREATE FUNCTION activity_changed_fields(
    old_row JSONB,
    new_row JSONB,
    ignored_fields TEXT[]
)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
    SELECT COALESCE(jsonb_agg(field_name ORDER BY field_name), '[]'::JSONB)
    FROM (
        SELECT fields.key AS field_name
        FROM jsonb_object_keys(new_row) AS fields(key)
        WHERE NOT (fields.key = ANY(ignored_fields))
          AND old_row -> fields.key IS DISTINCT FROM new_row -> fields.key
    ) AS changed;
$$;

CREATE FUNCTION write_activity_log(
    workspace_id_value UUID,
    actor_user_id_value UUID,
    operation_value "ActivityOperation",
    event_type_value "ActivityEventType",
    target_type_value "ActivityTargetType",
    target_id_value TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
    -- Inbox-only cards have no workspace contribution feed.
    IF workspace_id_value IS NULL THEN
        RETURN;
    END IF;

    INSERT INTO "ActivityLogs" (
        "workspace_id",
        "actor_user_id",
        "operation",
        "event_type",
        "target_type",
        "target_id"
    )
    VALUES (
        workspace_id_value,
        actor_user_id_value,
        operation_value,
        event_type_value,
        target_type_value,
        target_id_value
    );
END;
$$;

CREATE FUNCTION log_workspace_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    changed_fields JSONB;
BEGIN
    IF pg_trigger_depth() > 1 THEN
        IF TG_OP = 'DELETE' THEN
            RETURN OLD;
        END IF;
        RETURN NEW;
    END IF;

    IF TG_OP = 'INSERT' THEN
        PERFORM write_activity_log(
            NEW.id,
            NEW.created_by,
            'INSERT'::"ActivityOperation",
            'WORKSPACE_CREATED'::"ActivityEventType",
            'WORKSPACE'::"ActivityTargetType",
            NEW.id::TEXT
        );
        RETURN NEW;
    END IF;

    -- Physical deletes are maintenance/privacy operations. User-facing
    -- deletion is represented by deleted_at/deleted_by.
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;

    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
        PERFORM write_activity_log(
            NEW.id,
            NEW.deleted_by,
            'UPDATE'::"ActivityOperation",
            'WORKSPACE_DELETED'::"ActivityEventType",
            'WORKSPACE'::"ActivityTargetType",
            NEW.id::TEXT
        );
        RETURN NEW;
    END IF;

    IF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
        PERFORM write_activity_log(
            NEW.id,
            NEW.updated_by,
            'UPDATE'::"ActivityOperation",
            'WORKSPACE_UPDATED'::"ActivityEventType",
            'WORKSPACE'::"ActivityTargetType",
            NEW.id::TEXT
        );
        RETURN NEW;
    END IF;

    IF NEW.deleted_at IS NOT NULL THEN
        RETURN NEW;
    END IF;

    changed_fields := activity_changed_fields(
        to_jsonb(OLD),
        to_jsonb(NEW),
        ARRAY[
            'created_at', 'created_by', 'updated_at',
            'updated_by', 'deleted_at', 'deleted_by'
        ]
    );
    IF jsonb_array_length(changed_fields) = 0 THEN
        RETURN NEW;
    END IF;

    PERFORM write_activity_log(
        NEW.id,
        NEW.updated_by,
        'UPDATE'::"ActivityOperation",
        'WORKSPACE_UPDATED'::"ActivityEventType",
        'WORKSPACE'::"ActivityTargetType",
        NEW.id::TEXT
    );
    RETURN NEW;
END;
$$;

CREATE FUNCTION log_workspace_member_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF pg_trigger_depth() > 1 THEN
        IF TG_OP = 'DELETE' THEN
            RETURN OLD;
        END IF;
        RETURN NEW;
    END IF;

    IF TG_OP = 'INSERT' THEN
        PERFORM write_activity_log(
            NEW.workspace_id,
            NEW.created_by,
            'INSERT'::"ActivityOperation",
            'MEMBER_ADDED'::"ActivityEventType",
            'MEMBER'::"ActivityTargetType",
            NEW.user_id::TEXT
        );
        RETURN NEW;
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;

    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
        PERFORM write_activity_log(
            NEW.workspace_id,
            NEW.deleted_by,
            'UPDATE'::"ActivityOperation",
            'MEMBER_REMOVED'::"ActivityEventType",
            'MEMBER'::"ActivityTargetType",
            NEW.user_id::TEXT
        );
        RETURN NEW;
    END IF;

    IF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
        PERFORM write_activity_log(
            NEW.workspace_id,
            NEW.updated_by,
            'UPDATE'::"ActivityOperation",
            'MEMBER_ADDED'::"ActivityEventType",
            'MEMBER'::"ActivityTargetType",
            NEW.user_id::TEXT
        );
        RETURN NEW;
    END IF;

    IF NEW.deleted_at IS NOT NULL OR NEW.role IS NOT DISTINCT FROM OLD.role THEN
        RETURN NEW;
    END IF;

    PERFORM write_activity_log(
        NEW.workspace_id,
        NEW.updated_by,
        'UPDATE'::"ActivityOperation",
        'MEMBER_ROLE_CHANGED'::"ActivityEventType",
        'MEMBER'::"ActivityTargetType",
        NEW.user_id::TEXT
    );
    RETURN NEW;
END;
$$;

CREATE FUNCTION log_list_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    changed_fields JSONB;
    activity_event "ActivityEventType";
BEGIN
    IF pg_trigger_depth() > 1 THEN
        IF TG_OP = 'DELETE' THEN
            RETURN OLD;
        END IF;
        RETURN NEW;
    END IF;

    IF TG_OP = 'INSERT' THEN
        PERFORM write_activity_log(
            NEW.workspace_id,
            NEW.created_by,
            'INSERT'::"ActivityOperation",
            'LIST_CREATED'::"ActivityEventType",
            'LIST'::"ActivityTargetType",
            NEW.id::TEXT
        );
        RETURN NEW;
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;

    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
        PERFORM write_activity_log(
            NEW.workspace_id,
            NEW.deleted_by,
            'UPDATE'::"ActivityOperation",
            'LIST_DELETED'::"ActivityEventType",
            'LIST'::"ActivityTargetType",
            NEW.id::TEXT
        );
        RETURN NEW;
    END IF;

    IF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
        PERFORM write_activity_log(
            NEW.workspace_id,
            NEW.updated_by,
            'UPDATE'::"ActivityOperation",
            'LIST_UPDATED'::"ActivityEventType",
            'LIST'::"ActivityTargetType",
            NEW.id::TEXT
        );
        RETURN NEW;
    END IF;

    IF NEW.deleted_at IS NOT NULL THEN
        RETURN NEW;
    END IF;

    changed_fields := activity_changed_fields(
        to_jsonb(OLD),
        to_jsonb(NEW),
        ARRAY[
            'created_at', 'created_by', 'updated_at',
            'updated_by', 'deleted_at', 'deleted_by'
        ]
    );
    IF jsonb_array_length(changed_fields) = 0 THEN
        RETURN NEW;
    END IF;

    IF NEW.sequence IS DISTINCT FROM OLD.sequence THEN
        activity_event := 'LIST_MOVED'::"ActivityEventType";
    ELSE
        activity_event := 'LIST_UPDATED'::"ActivityEventType";
    END IF;

    PERFORM write_activity_log(
        NEW.workspace_id,
        NEW.updated_by,
        'UPDATE'::"ActivityOperation",
        activity_event,
        'LIST'::"ActivityTargetType",
        NEW.id::TEXT
    );
    RETURN NEW;
END;
$$;

CREATE FUNCTION log_card_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    workspace_id_value UUID;
    changed_fields JSONB;
    activity_event "ActivityEventType";
    old_list_done BOOLEAN := false;
    new_list_done BOOLEAN := false;
BEGIN
    IF pg_trigger_depth() > 1 THEN
        IF TG_OP = 'DELETE' THEN
            RETURN OLD;
        END IF;
        RETURN NEW;
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;

    IF NEW.list_id IS NOT NULL THEN
        SELECT "workspace_id", "is_done"
        INTO workspace_id_value, new_list_done
        FROM "Lists"
        WHERE "id" = NEW.list_id;
    ELSIF TG_OP = 'UPDATE' AND OLD.list_id IS NOT NULL THEN
        SELECT "workspace_id"
        INTO workspace_id_value
        FROM "Lists"
        WHERE "id" = OLD.list_id;
    END IF;

    IF TG_OP = 'INSERT' THEN
        PERFORM write_activity_log(
            workspace_id_value,
            NEW.created_by,
            'INSERT'::"ActivityOperation",
            'CARD_CREATED'::"ActivityEventType",
            'CARD'::"ActivityTargetType",
            NEW.id::TEXT
        );
        RETURN NEW;
    END IF;

    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
        PERFORM write_activity_log(
            workspace_id_value,
            NEW.deleted_by,
            'UPDATE'::"ActivityOperation",
            'CARD_DELETED'::"ActivityEventType",
            'CARD'::"ActivityTargetType",
            NEW.id::TEXT
        );
        RETURN NEW;
    END IF;

    IF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
        PERFORM write_activity_log(
            workspace_id_value,
            NEW.updated_by,
            'UPDATE'::"ActivityOperation",
            'CARD_UPDATED'::"ActivityEventType",
            'CARD'::"ActivityTargetType",
            NEW.id::TEXT
        );
        RETURN NEW;
    END IF;

    IF NEW.deleted_at IS NOT NULL THEN
        RETURN NEW;
    END IF;

    changed_fields := activity_changed_fields(
        to_jsonb(OLD),
        to_jsonb(NEW),
        ARRAY[
            'created_at', 'created_by', 'updated_at',
            'updated_by', 'deleted_at', 'deleted_by'
        ]
    );
    IF jsonb_array_length(changed_fields) = 0 THEN
        RETURN NEW;
    END IF;

    IF OLD.list_id IS NOT NULL THEN
        SELECT "is_done"
        INTO old_list_done
        FROM "Lists"
        WHERE "id" = OLD.list_id;
    END IF;

    IF NEW.list_id IS DISTINCT FROM OLD.list_id THEN
        IF COALESCE(new_list_done, false)
           AND NOT COALESCE(old_list_done, false) THEN
            activity_event := 'CARD_COMPLETED'::"ActivityEventType";
        ELSIF COALESCE(old_list_done, false)
              AND NOT COALESCE(new_list_done, false) THEN
            activity_event := 'CARD_REOPENED'::"ActivityEventType";
        ELSE
            activity_event := 'CARD_MOVED'::"ActivityEventType";
        END IF;
    ELSIF NEW.sequence IS DISTINCT FROM OLD.sequence THEN
        activity_event := 'CARD_MOVED'::"ActivityEventType";
    ELSE
        activity_event := 'CARD_UPDATED'::"ActivityEventType";
    END IF;

    PERFORM write_activity_log(
        workspace_id_value,
        NEW.updated_by,
        'UPDATE'::"ActivityOperation",
        activity_event,
        'CARD'::"ActivityTargetType",
        NEW.id::TEXT
    );
    RETURN NEW;
END;
$$;

CREATE FUNCTION log_comment_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    workspace_id_value UUID;
    changed_fields JSONB;
BEGIN
    IF pg_trigger_depth() > 1 THEN
        IF TG_OP = 'DELETE' THEN
            RETURN OLD;
        END IF;
        RETURN NEW;
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;

    SELECT lists."workspace_id"
    INTO workspace_id_value
    FROM "Cards" AS cards
    JOIN "Lists" AS lists ON lists."id" = cards."list_id"
    WHERE cards."id" = NEW.card_id;

    IF TG_OP = 'INSERT' THEN
        PERFORM write_activity_log(
            workspace_id_value,
            COALESCE(NEW.created_by, NEW.user_id),
            'INSERT'::"ActivityOperation",
            'COMMENT_CREATED'::"ActivityEventType",
            'COMMENT'::"ActivityTargetType",
            NEW.id::TEXT
        );
        RETURN NEW;
    END IF;

    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
        PERFORM write_activity_log(
            workspace_id_value,
            NEW.deleted_by,
            'UPDATE'::"ActivityOperation",
            'COMMENT_DELETED'::"ActivityEventType",
            'COMMENT'::"ActivityTargetType",
            NEW.id::TEXT
        );
        RETURN NEW;
    END IF;

    IF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
        PERFORM write_activity_log(
            workspace_id_value,
            NEW.updated_by,
            'UPDATE'::"ActivityOperation",
            'COMMENT_UPDATED'::"ActivityEventType",
            'COMMENT'::"ActivityTargetType",
            NEW.id::TEXT
        );
        RETURN NEW;
    END IF;

    IF NEW.deleted_at IS NOT NULL THEN
        RETURN NEW;
    END IF;

    changed_fields := activity_changed_fields(
        to_jsonb(OLD),
        to_jsonb(NEW),
        ARRAY[
            'created_at', 'created_by', 'updated_at',
            'updated_by', 'deleted_at', 'deleted_by'
        ]
    );
    IF jsonb_array_length(changed_fields) = 0 THEN
        RETURN NEW;
    END IF;

    PERFORM write_activity_log(
        workspace_id_value,
        NEW.updated_by,
        'UPDATE'::"ActivityOperation",
        'COMMENT_UPDATED'::"ActivityEventType",
        'COMMENT'::"ActivityTargetType",
        NEW.id::TEXT
    );
    RETURN NEW;
END;
$$;

CREATE TRIGGER activity_workspaces
AFTER INSERT OR UPDATE OR DELETE ON "Workspaces"
FOR EACH ROW
EXECUTE FUNCTION log_workspace_activity();

CREATE TRIGGER activity_workspace_members
AFTER INSERT OR UPDATE OR DELETE ON "WorkspaceMembers"
FOR EACH ROW
EXECUTE FUNCTION log_workspace_member_activity();

CREATE TRIGGER activity_lists
AFTER INSERT OR UPDATE OR DELETE ON "Lists"
FOR EACH ROW
EXECUTE FUNCTION log_list_activity();

CREATE TRIGGER activity_cards
AFTER INSERT OR UPDATE OR DELETE ON "Cards"
FOR EACH ROW
EXECUTE FUNCTION log_card_activity();

CREATE TRIGGER activity_comments
AFTER INSERT OR UPDATE OR DELETE ON "Comments"
FOR EACH ROW
EXECUTE FUNCTION log_comment_activity();

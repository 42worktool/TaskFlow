-- Card completion is a property of the card, independent from its Kanban list.
-- Existing cards in a completion-stage list keep their visible completed state.
ALTER TABLE "Cards"
    ADD COLUMN "is_completed" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Cards" DISABLE TRIGGER activity_cards;

UPDATE "Cards" AS card
SET "is_completed" = true
FROM "Lists" AS list
WHERE card."list_id" = list."id"
  AND list."is_done" = true;

ALTER TABLE "Cards" ENABLE TRIGGER activity_cards;

-- Completion/reopen activity now follows the card flag. Moving a card between
-- lists remains a move and no longer changes its completion state implicitly.
CREATE OR REPLACE FUNCTION log_card_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    workspace_id_value UUID;
    changed_fields JSONB;
    activity_event "ActivityEventType";
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
        SELECT "workspace_id"
        INTO workspace_id_value
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

    IF NEW.is_completed IS DISTINCT FROM OLD.is_completed THEN
        IF NEW.is_completed THEN
            activity_event := 'CARD_COMPLETED'::"ActivityEventType";
        ELSE
            activity_event := 'CARD_REOPENED'::"ActivityEventType";
        END IF;
    ELSIF NEW.list_id IS DISTINCT FROM OLD.list_id
          OR NEW.sequence IS DISTINCT FROM OLD.sequence THEN
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

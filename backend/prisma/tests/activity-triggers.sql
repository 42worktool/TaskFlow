\set ON_ERROR_STOP on

-- Run with psql after all Prisma migrations have been deployed.
-- The transaction keeps the test repeatable and leaves the database unchanged.
BEGIN;

INSERT INTO "Users" (
    "id", "email", "name", "created_at", "updated_at"
)
VALUES
    (
        '00000000-0000-4000-8000-000000000001',
        'activity-owner@example.test',
        'Activity Owner',
        TIMESTAMP '2026-07-24 00:00:00',
        TIMESTAMP '2026-07-24 00:00:00'
    ),
    (
        '00000000-0000-4000-8000-000000000002',
        'activity-member@example.test',
        'Activity Member',
        TIMESTAMP '2026-07-24 00:00:00',
        TIMESTAMP '2026-07-24 00:00:00'
    );

INSERT INTO "Workspaces" (
    "id", "name", "is_public", "created_by", "updated_by",
    "created_at", "updated_at"
)
VALUES (
    '10000000-0000-4000-8000-000000000001',
    'Activity Test Workspace',
    false,
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000001',
    TIMESTAMP '2026-07-24 00:00:00',
    TIMESTAMP '2026-07-24 00:00:00'
);

-- These two writes mirror the nested owner/member writes performed while a
-- workspace is created by the application.
INSERT INTO "WorkspaceMembers" (
    "workspace_id", "user_id", "role", "created_by", "updated_by"
)
VALUES (
    '10000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000001',
    'OWNER',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000001'
);

INSERT INTO "WorkspaceMembers" (
    "workspace_id", "user_id", "role", "created_by", "updated_by"
)
VALUES (
    '10000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000002',
    'MEMBER',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000001'
);

UPDATE "WorkspaceMembers"
SET
    "role" = 'ADMIN',
    "updated_by" = '00000000-0000-4000-8000-000000000001'
WHERE
    "workspace_id" = '10000000-0000-4000-8000-000000000001'
    AND "user_id" = '00000000-0000-4000-8000-000000000002';

UPDATE "Workspaces"
SET
    "name" = 'Renamed Activity Test Workspace',
    "updated_by" = '00000000-0000-4000-8000-000000000001',
    "updated_at" = TIMESTAMP '2026-07-24 00:01:00'
WHERE "id" = '10000000-0000-4000-8000-000000000001';

-- A true no-op and an audit-only touch must not create duplicate UPDATE logs.
UPDATE "Workspaces"
SET "name" = "name"
WHERE "id" = '10000000-0000-4000-8000-000000000001';

UPDATE "Workspaces"
SET
    "updated_by" = '00000000-0000-4000-8000-000000000002',
    "updated_at" = TIMESTAMP '2026-07-24 00:02:00'
WHERE "id" = '10000000-0000-4000-8000-000000000001';

DO $assert$
DECLARE
    update_count BIGINT;
BEGIN
    SELECT count(*)
    INTO update_count
    FROM "ActivityLogs"
    WHERE "workspace_id" = '10000000-0000-4000-8000-000000000001'
      AND "event_type" = 'WORKSPACE_UPDATED';

    IF update_count <> 1 THEN
        RAISE EXCEPTION
            'audit-only/no-op workspace updates created extra logs: expected 1, got %',
            update_count;
    END IF;
END;
$assert$;

INSERT INTO "Lists" (
    "id", "workspace_id", "name", "sequence", "is_done",
    "created_by", "updated_by"
)
VALUES
    (
        '20000000-0000-4000-8000-000000000001',
        '10000000-0000-4000-8000-000000000001',
        'To Do',
        1,
        false,
        '00000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-000000000001'
    ),
    (
        '20000000-0000-4000-8000-000000000002',
        '10000000-0000-4000-8000-000000000001',
        'Done',
        2,
        true,
        '00000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-000000000001'
    );

UPDATE "Lists"
SET
    "sequence" = 0.5,
    "updated_by" = '00000000-0000-4000-8000-000000000001'
WHERE "id" = '20000000-0000-4000-8000-000000000001';

INSERT INTO "Cards" (
    "id", "list_id", "user_id", "title", "description", "sequence",
    "created_by", "updated_by", "created_at"
)
VALUES (
    '30000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000002',
    'Private card title canary',
    'super-secret-card-body',
    1,
    '00000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000002',
    TIMESTAMP '2026-07-24 00:03:00'
);

UPDATE "Cards"
SET
    "title" = 'Edited private card title canary',
    "description" = 'edited-secret-card-body',
    "updated_by" = '00000000-0000-4000-8000-000000000002'
WHERE "id" = '30000000-0000-4000-8000-000000000001';

UPDATE "Cards"
SET
    "sequence" = 1.5,
    "updated_by" = '00000000-0000-4000-8000-000000000002'
WHERE "id" = '30000000-0000-4000-8000-000000000001';

UPDATE "Cards"
SET
    "list_id" = '20000000-0000-4000-8000-000000000002',
    "updated_by" = '00000000-0000-4000-8000-000000000002'
WHERE "id" = '30000000-0000-4000-8000-000000000001';

UPDATE "Cards"
SET
    "list_id" = '20000000-0000-4000-8000-000000000001',
    "updated_by" = '00000000-0000-4000-8000-000000000002'
WHERE "id" = '30000000-0000-4000-8000-000000000001';

INSERT INTO "Comments" (
    "id", "card_id", "user_id", "comment_str", "created_by", "updated_by",
    "created_at"
)
VALUES (
    '40000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000002',
    'super-secret-comment-body',
    '00000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000002',
    TIMESTAMP '2026-07-24 00:04:00'
);

UPDATE "Comments"
SET
    "comment_str" = 'edited-secret-comment-body',
    "updated_by" = '00000000-0000-4000-8000-000000000002',
    "updated_at" = TIMESTAMP '2026-07-24 00:05:00'
WHERE "id" = '40000000-0000-4000-8000-000000000001';

UPDATE "Comments"
SET
    "deleted_at" = TIMESTAMPTZ '2026-07-24 00:05:30+00',
    "deleted_by" = '00000000-0000-4000-8000-000000000002',
    "updated_by" = '00000000-0000-4000-8000-000000000002'
WHERE "id" = '40000000-0000-4000-8000-000000000001';

UPDATE "Cards"
SET
    "deleted_at" = TIMESTAMPTZ '2026-07-24 00:05:40+00',
    "deleted_by" = '00000000-0000-4000-8000-000000000002',
    "updated_by" = '00000000-0000-4000-8000-000000000002'
WHERE "id" = '30000000-0000-4000-8000-000000000001';

-- Leave a populated subtree behind to prove that workspace soft deletion
-- records only the workspace action and preserves descendants.
INSERT INTO "Cards" (
    "id", "list_id", "user_id", "title", "description", "sequence",
    "created_by", "updated_by", "created_at"
)
VALUES (
    '30000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000002',
    'Cascade card title canary',
    'cascade-secret-card-body',
    2,
    '00000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000002',
    TIMESTAMP '2026-07-24 00:06:00'
);

INSERT INTO "Comments" (
    "id", "card_id", "user_id", "comment_str", "created_by", "updated_by",
    "created_at"
)
VALUES (
    '40000000-0000-4000-8000-000000000002',
    '30000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000002',
    'cascade-secret-comment-body',
    '00000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000002',
    TIMESTAMP '2026-07-24 00:07:00'
);

UPDATE "WorkspaceMembers"
SET
    "deleted_at" = TIMESTAMPTZ '2026-07-24 00:08:00+00',
    "deleted_by" = '00000000-0000-4000-8000-000000000001',
    "updated_by" = '00000000-0000-4000-8000-000000000001'
WHERE
    "workspace_id" = '10000000-0000-4000-8000-000000000001'
    AND "user_id" = '00000000-0000-4000-8000-000000000002';

CREATE TEMP TABLE activity_delete_checkpoint (
    "log_count" BIGINT NOT NULL
) ON COMMIT DROP;

INSERT INTO activity_delete_checkpoint ("log_count")
SELECT count(*)
FROM "ActivityLogs"
WHERE "workspace_id" = '10000000-0000-4000-8000-000000000001';

UPDATE "Workspaces"
SET
    "deleted_at" = TIMESTAMPTZ '2026-07-24 00:09:00+00',
    "deleted_by" = '00000000-0000-4000-8000-000000000001',
    "updated_by" = '00000000-0000-4000-8000-000000000001'
WHERE "id" = '10000000-0000-4000-8000-000000000001';

DO $assert$
DECLARE
    before_delete BIGINT;
    after_delete BIGINT;
BEGIN
    SELECT "log_count" INTO before_delete
    FROM activity_delete_checkpoint;

    SELECT count(*) INTO after_delete
    FROM "ActivityLogs"
    WHERE "workspace_id" = '10000000-0000-4000-8000-000000000001';

    IF after_delete <> before_delete + 1 THEN
        RAISE EXCEPTION
            'workspace soft delete created a child-event flood: before %, after %',
            before_delete,
            after_delete;
    END IF;

    IF (
        SELECT count(*)
        FROM "ActivityLogs"
        WHERE "workspace_id" = '10000000-0000-4000-8000-000000000001'
          AND "event_type" = 'WORKSPACE_DELETED'
          AND "operation" = 'UPDATE'
          AND "actor_user_id" = '00000000-0000-4000-8000-000000000001'
    ) <> 1 THEN
        RAISE EXCEPTION 'workspace delete event, operation, or actor is invalid';
    END IF;
END;
$assert$;

DO $assert$
DECLARE
    expected RECORD;
    actual_event_count BIGINT;
    actual_operation_count BIGINT;
    total_count BIGINT;
BEGIN
    FOR expected IN
        SELECT *
        FROM (
            VALUES
                ('WORKSPACE_CREATED',    'INSERT', 1),
                ('WORKSPACE_UPDATED',    'UPDATE', 1),
                ('WORKSPACE_DELETED',    'UPDATE', 1),
                ('MEMBER_ADDED',         'INSERT', 2),
                ('MEMBER_REMOVED',       'UPDATE', 1),
                ('MEMBER_ROLE_CHANGED',  'UPDATE', 1),
                ('LIST_CREATED',         'INSERT', 2),
                ('LIST_UPDATED',         'UPDATE', 0),
                ('LIST_MOVED',           'UPDATE', 1),
                ('LIST_DELETED',         'UPDATE', 0),
                ('CARD_CREATED',         'INSERT', 2),
                ('CARD_UPDATED',         'UPDATE', 1),
                ('CARD_MOVED',           'UPDATE', 1),
                ('CARD_COMPLETED',       'UPDATE', 1),
                ('CARD_REOPENED',        'UPDATE', 1),
                ('CARD_DELETED',         'UPDATE', 1),
                ('COMMENT_CREATED',      'INSERT', 2),
                ('COMMENT_UPDATED',      'UPDATE', 1),
                ('COMMENT_DELETED',      'UPDATE', 1)
        ) AS expected_events(event_type, operation, expected_count)
    LOOP
        SELECT
            count(*),
            count(*) FILTER (
                WHERE "operation"::TEXT = expected.operation
            )
        INTO actual_event_count, actual_operation_count
        FROM "ActivityLogs"
        WHERE "workspace_id" = '10000000-0000-4000-8000-000000000001'
          AND "event_type"::TEXT = expected.event_type;

        IF actual_event_count <> expected.expected_count
           OR actual_operation_count <> expected.expected_count THEN
            RAISE EXCEPTION
                'unexpected % logs: expected % %, got % total / % matching operation',
                expected.event_type,
                expected.expected_count,
                expected.operation,
                actual_event_count,
                actual_operation_count;
        END IF;
    END LOOP;

    SELECT count(*) INTO total_count
    FROM "ActivityLogs"
    WHERE "workspace_id" = '10000000-0000-4000-8000-000000000001';

    IF total_count <> 21 THEN
        RAISE EXCEPTION 'unexpected total activity count: expected 21, got %', total_count;
    END IF;
END;
$assert$;

DO $assert$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM "ActivityLogs"
        WHERE "workspace_id" = '10000000-0000-4000-8000-000000000001'
          AND "target_type" IN ('WORKSPACE', 'MEMBER', 'LIST')
          AND "actor_user_id" IS DISTINCT FROM
              '00000000-0000-4000-8000-000000000001'::UUID
    ) THEN
        RAISE EXCEPTION 'workspace/member/list event has the wrong actor';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM "ActivityLogs"
        WHERE "workspace_id" = '10000000-0000-4000-8000-000000000001'
          AND "target_type" IN ('CARD', 'COMMENT')
          AND "actor_user_id" IS DISTINCT FROM
              '00000000-0000-4000-8000-000000000002'::UUID
    ) THEN
        RAISE EXCEPTION 'card/comment event has the wrong actor';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'ActivityLogs'
          AND column_name = 'metadata'
    ) THEN
        RAISE EXCEPTION 'ActivityLogs.metadata must not exist';
    END IF;
END;
$assert$;

-- Soft deletion keeps descendants intact and creates only the selected
-- aggregate's deletion event.
INSERT INTO "Workspaces" (
    "id", "name", "is_public", "created_by", "updated_by",
    "created_at", "updated_at"
)
VALUES (
    '50000000-0000-4000-8000-000000000001',
    'Nested Cascade Test',
    false,
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000001',
    TIMESTAMP '2026-07-24 01:00:00',
    TIMESTAMP '2026-07-24 01:00:00'
);

INSERT INTO "Lists" (
    "id", "workspace_id", "name", "sequence", "is_done",
    "created_by", "updated_by"
)
VALUES (
    '50000000-0000-4000-8000-000000000002',
    '50000000-0000-4000-8000-000000000001',
    'Nested Cascade List',
    1,
    false,
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000001'
);

INSERT INTO "Cards" (
    "id", "list_id", "title", "description", "sequence",
    "created_by", "updated_by"
)
VALUES (
    '50000000-0000-4000-8000-000000000003',
    '50000000-0000-4000-8000-000000000002',
    'Card cascade target',
    'card cascade body',
    1,
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000001'
);

INSERT INTO "Comments" (
    "id", "card_id", "user_id", "comment_str", "created_by", "updated_by"
)
VALUES (
    '50000000-0000-4000-8000-000000000004',
    '50000000-0000-4000-8000-000000000003',
    '00000000-0000-4000-8000-000000000001',
    'comment cascade body',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000001'
);

DELETE FROM "ActivityLogs"
WHERE "workspace_id" = '50000000-0000-4000-8000-000000000001';

UPDATE "Cards"
SET
    "deleted_at" = TIMESTAMPTZ '2026-07-24 01:05:00+00',
    "deleted_by" = '00000000-0000-4000-8000-000000000001',
    "updated_by" = '00000000-0000-4000-8000-000000000001'
WHERE "id" = '50000000-0000-4000-8000-000000000003';

DO $assert$
BEGIN
    IF (
        SELECT count(*)
        FROM "ActivityLogs"
        WHERE "workspace_id" = '50000000-0000-4000-8000-000000000001'
    ) <> 1 OR NOT EXISTS (
        SELECT 1
        FROM "ActivityLogs"
        WHERE "workspace_id" = '50000000-0000-4000-8000-000000000001'
          AND "event_type" = 'CARD_DELETED'
          AND "operation" = 'UPDATE'
          AND "actor_user_id" =
              '00000000-0000-4000-8000-000000000001'::UUID
    ) THEN
        RAISE EXCEPTION 'card soft delete emitted an invalid activity set';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM "Cards"
        WHERE "id" = '50000000-0000-4000-8000-000000000003'
          AND "deleted_at" IS NOT NULL
    ) OR NOT EXISTS (
        SELECT 1
        FROM "Comments"
        WHERE "id" = '50000000-0000-4000-8000-000000000004'
          AND "deleted_at" IS NULL
    ) THEN
        RAISE EXCEPTION 'card soft delete did not preserve its row or descendants';
    END IF;
END;
$assert$;

INSERT INTO "Cards" (
    "id", "list_id", "title", "description", "sequence",
    "created_by", "updated_by"
)
VALUES (
    '50000000-0000-4000-8000-000000000005',
    '50000000-0000-4000-8000-000000000002',
    'List cascade target',
    'list cascade body',
    2,
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000001'
);

DELETE FROM "ActivityLogs"
WHERE "workspace_id" = '50000000-0000-4000-8000-000000000001';

UPDATE "Lists"
SET
    "deleted_at" = TIMESTAMPTZ '2026-07-24 01:06:00+00',
    "deleted_by" = '00000000-0000-4000-8000-000000000001',
    "updated_by" = '00000000-0000-4000-8000-000000000001'
WHERE "id" = '50000000-0000-4000-8000-000000000002';

DO $assert$
BEGIN
    IF (
        SELECT count(*)
        FROM "ActivityLogs"
        WHERE "workspace_id" = '50000000-0000-4000-8000-000000000001'
    ) <> 1 OR NOT EXISTS (
        SELECT 1
        FROM "ActivityLogs"
        WHERE "workspace_id" = '50000000-0000-4000-8000-000000000001'
          AND "event_type" = 'LIST_DELETED'
          AND "operation" = 'UPDATE'
          AND "actor_user_id" =
              '00000000-0000-4000-8000-000000000001'::UUID
    ) THEN
        RAISE EXCEPTION 'list soft delete emitted an invalid activity set';
    END IF;

    IF (
        SELECT "list_id"
        FROM "Cards"
        WHERE "id" = '50000000-0000-4000-8000-000000000005'
    ) IS DISTINCT FROM
        '50000000-0000-4000-8000-000000000002'::UUID THEN
        RAISE EXCEPTION 'list soft delete changed its child card relation';
    END IF;
END;
$assert$;

ROLLBACK;

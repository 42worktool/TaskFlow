-- 현재 Prisma 스키마의 최종 DDL과 Prisma로 표현할 수 없는 DB 제약조건,
-- 활동 로그 동작을 한 번에 구성하는 초기 baseline이다.

CREATE SCHEMA IF NOT EXISTS "public";

CREATE TYPE "Role" AS ENUM ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER');

CREATE TABLE "Users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "password_hash" TEXT,
    "name" TEXT NOT NULL,
    "profile_image_url" TEXT,
    "headline" VARCHAR(160) NOT NULL DEFAULT '안녕하세요',
    "linkedin_url" VARCHAR(2048),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "deleted_at" TIMESTAMPTZ(3),
    "deleted_by" UUID,

    CONSTRAINT "Users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Friendships" (
    "user_low_id" UUID NOT NULL,
    "user_high_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Friendships_pkey" PRIMARY KEY ("user_low_id", "user_high_id")
);

CREATE TABLE "FriendRequests" (
    "user_low_id" UUID NOT NULL,
    "user_high_id" UUID NOT NULL,
    "requested_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FriendRequests_pkey" PRIMARY KEY ("user_low_id", "user_high_id")
);

CREATE TABLE "DirectMessages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sender_user_id" UUID NOT NULL,
    "recipient_user_id" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DirectMessages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OAuthAccounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "deleted_at" TIMESTAMPTZ(3),
    "deleted_by" UUID,

    CONSTRAINT "OAuthAccounts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Workspaces" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "is_public" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "deleted_at" TIMESTAMPTZ(3),
    "deleted_by" UUID,

    CONSTRAINT "Workspaces_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkspaceMembers" (
    "workspace_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "Role" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "deleted_at" TIMESTAMPTZ(3),
    "deleted_by" UUID,

    CONSTRAINT "WorkspaceMembers_pkey" PRIMARY KEY ("workspace_id", "user_id")
);

CREATE TABLE "WorkspaceMessages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "card_id" UUID,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceMessages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Lists" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sequence" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "deleted_at" TIMESTAMPTZ(3),
    "deleted_by" UUID,

    CONSTRAINT "Lists_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Cards" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "list_id" UUID,
    "user_id" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "is_completed" BOOLEAN NOT NULL DEFAULT false,
    "start_at" TIMESTAMP(3),
    "deadline" TIMESTAMP(3),
    "sequence" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "deleted_at" TIMESTAMPTZ(3),
    "deleted_by" UUID,

    CONSTRAINT "Cards_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Labels" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "label_name" TEXT NOT NULL,
    "label_color" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "deleted_at" TIMESTAMPTZ(3),
    "deleted_by" UUID,

    CONSTRAINT "Labels_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CardLabels" (
    "label_id" UUID NOT NULL,
    "card_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "deleted_at" TIMESTAMPTZ(3),
    "deleted_by" UUID,

    CONSTRAINT "CardLabels_pkey" PRIMARY KEY ("label_id", "card_id")
);

CREATE TABLE "Attachments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "card_id" UUID NOT NULL,
    "file_url" TEXT,
    "file_name" TEXT,
    "storage_key" VARCHAR(255),
    "mime_type" VARCHAR(127),
    "size_bytes" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "deleted_at" TIMESTAMPTZ(3),
    "deleted_by" UUID,

    CONSTRAINT "Attachments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Comments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "card_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "comment_str" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "deleted_at" TIMESTAMPTZ(3),
    "deleted_by" UUID,

    CONSTRAINT "Comments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Users_email_key" ON "Users"("email");
CREATE INDEX "Friendships_user_high_id_idx" ON "Friendships"("user_high_id");
CREATE INDEX "FriendRequests_user_high_id_idx" ON "FriendRequests"("user_high_id");
CREATE INDEX "DirectMessages_sender_user_id_recipient_user_id_created_at__idx"
    ON "DirectMessages"("sender_user_id", "recipient_user_id", "created_at", "id");
CREATE INDEX "DirectMessages_recipient_user_id_sender_user_id_created_at__idx"
    ON "DirectMessages"("recipient_user_id", "sender_user_id", "created_at", "id");
CREATE UNIQUE INDEX "OAuthAccounts_provider_provider_id_key"
    ON "OAuthAccounts"("provider", "provider_id");
CREATE INDEX "Workspaces_deleted_at_idx" ON "Workspaces"("deleted_at");
CREATE INDEX "WorkspaceMembers_workspace_id_deleted_at_idx"
    ON "WorkspaceMembers"("workspace_id", "deleted_at");
CREATE INDEX "WorkspaceMembers_user_id_deleted_at_idx"
    ON "WorkspaceMembers"("user_id", "deleted_at");
CREATE INDEX "WorkspaceMessages_workspace_id_created_at_idx"
    ON "WorkspaceMessages"("workspace_id", "created_at");
CREATE INDEX "WorkspaceMessages_card_id_idx" ON "WorkspaceMessages"("card_id");
CREATE INDEX "Lists_workspace_id_deleted_at_idx" ON "Lists"("workspace_id", "deleted_at");
CREATE INDEX "Cards_list_id_deleted_at_idx" ON "Cards"("list_id", "deleted_at");
CREATE INDEX "Attachments_card_id_idx" ON "Attachments"("card_id");
CREATE INDEX "Comments_card_id_deleted_at_idx" ON "Comments"("card_id", "deleted_at");

ALTER TABLE "Friendships"
    ADD CONSTRAINT "Friendships_user_low_id_fkey"
    FOREIGN KEY ("user_low_id") REFERENCES "Users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Friendships"
    ADD CONSTRAINT "Friendships_user_high_id_fkey"
    FOREIGN KEY ("user_high_id") REFERENCES "Users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FriendRequests"
    ADD CONSTRAINT "FriendRequests_user_low_id_fkey"
    FOREIGN KEY ("user_low_id") REFERENCES "Users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FriendRequests"
    ADD CONSTRAINT "FriendRequests_user_high_id_fkey"
    FOREIGN KEY ("user_high_id") REFERENCES "Users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DirectMessages"
    ADD CONSTRAINT "DirectMessages_sender_user_id_fkey"
    FOREIGN KEY ("sender_user_id") REFERENCES "Users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DirectMessages"
    ADD CONSTRAINT "DirectMessages_recipient_user_id_fkey"
    FOREIGN KEY ("recipient_user_id") REFERENCES "Users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OAuthAccounts"
    ADD CONSTRAINT "OAuthAccounts_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "Users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkspaceMembers"
    ADD CONSTRAINT "WorkspaceMembers_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "Workspaces"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkspaceMembers"
    ADD CONSTRAINT "WorkspaceMembers_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "Users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkspaceMessages"
    ADD CONSTRAINT "WorkspaceMessages_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "Workspaces"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkspaceMessages"
    ADD CONSTRAINT "WorkspaceMessages_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "Users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkspaceMessages"
    ADD CONSTRAINT "WorkspaceMessages_card_id_fkey"
    FOREIGN KEY ("card_id") REFERENCES "Cards"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Lists"
    ADD CONSTRAINT "Lists_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "Workspaces"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Cards"
    ADD CONSTRAINT "Cards_list_id_fkey"
    FOREIGN KEY ("list_id") REFERENCES "Lists"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Cards"
    ADD CONSTRAINT "Cards_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "Users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Labels"
    ADD CONSTRAINT "Labels_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "Workspaces"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CardLabels"
    ADD CONSTRAINT "CardLabels_label_id_fkey"
    FOREIGN KEY ("label_id") REFERENCES "Labels"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CardLabels"
    ADD CONSTRAINT "CardLabels_card_id_fkey"
    FOREIGN KEY ("card_id") REFERENCES "Cards"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Attachments"
    ADD CONSTRAINT "Attachments_card_id_fkey"
    FOREIGN KEY ("card_id") REFERENCES "Cards"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Comments"
    ADD CONSTRAINT "Comments_card_id_fkey"
    FOREIGN KEY ("card_id") REFERENCES "Cards"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Comments"
    ADD CONSTRAINT "Comments_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "Users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ActivityLogs는 애플리케이션에서 추가 중심 이력으로 취급하는 워크스페이스 활동 피드다.
-- 개발 seed처럼 재현 가능한 fixture를 만들 때는 기존 로그를 지우고 다시 구성할 수 있다.
-- 행동 주체나 원본 행이 삭제된 뒤에도 과거 기록을 읽을 수 있도록
-- 의도적으로 사용자 및 원본 테이블 외래 키를 두지 않는다.

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

-- 논리 삭제에는 삭제 시각과 행동 주체가 반드시 함께 있어야 한다.
-- 활동 피드가 추적하는 다섯 대상에서 불완전한 삭제 상태가 생기지 않게 제한한다.
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

ALTER TABLE "Friendships"
    ADD CONSTRAINT "Friendships_canonical_pair_check"
    CHECK ("user_low_id" < "user_high_id");

ALTER TABLE "FriendRequests"
    ADD CONSTRAINT "FriendRequests_canonical_pair_check"
    CHECK ("user_low_id" < "user_high_id");

ALTER TABLE "FriendRequests"
    ADD CONSTRAINT "FriendRequests_sender_is_participant_check"
    CHECK (
        "requested_by_id" = "user_low_id"
        OR "requested_by_id" = "user_high_id"
    );

ALTER TABLE "DirectMessages"
    ADD CONSTRAINT "DirectMessages_distinct_participants_check"
    CHECK ("sender_user_id" <> "recipient_user_id");

-- 이전 행과 새 행을 비교해 실제로 값이 달라진 필드 이름만 반환한다.
-- updated_at 같은 감사 필드는 ignored_fields로 제외해, 업무 데이터가 그대로인
-- 업데이트가 활동 로그를 불필요하게 생성하지 않도록 공통 비교 함수로 분리했다.
CREATE FUNCTION activity_changed_fields(
    old_row JSONB,
    new_row JSONB,
    ignored_fields TEXT[]
)
RETURNS JSONB
LANGUAGE sql
-- 입력값만 비교하고 테이블을 조회하거나 수정하지 않으므로 같은 입력에는 항상
-- 같은 결과를 보장하며 병렬 실행도 안전하다.
IMMUTABLE
PARALLEL SAFE
AS $$
    -- IS DISTINCT FROM은 일반 비교와 달리 NULL도 안전하게 비교한다.
    -- 정렬된 JSON 배열을 반환하면 호출부가 변경 유무를 길이 하나로 판단할 수 있고,
    -- 변경된 필드가 없을 때도 NULL 대신 빈 배열을 받는다.
    SELECT COALESCE(jsonb_agg(field_name ORDER BY field_name), '[]'::JSONB)
    FROM (
        SELECT fields.key AS field_name
        FROM jsonb_object_keys(new_row) AS fields(key)
        WHERE NOT (fields.key = ANY(ignored_fields))
          AND old_row -> fields.key IS DISTINCT FROM new_row -> fields.key
    ) AS changed;
$$;

-- 각 도메인 트리거가 만든 이벤트를 ActivityLogs에 동일한 형식으로 기록한다.
-- INSERT 문을 한곳에 모아 이벤트마다 컬럼 구성이 달라지는 실수를 막고,
-- 워크스페이스 활동으로 볼 수 없는 항목을 공통으로 걸러낸다.
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
    -- 개인 인박스 카드는 workspace_id가 없으므로 워크스페이스 대시보드에
    -- 포함하지 않는다. 호출부마다 같은 NULL 검사를 반복하지 않기 위해 여기서 종료한다.
    IF workspace_id_value IS NULL THEN
        RETURN;
    END IF;

    -- actor_user_id에는 행동 주체를 넣되, 계정이 삭제된 뒤에도 활동 이력을
    -- 보존해야 하므로 ActivityLogs에는 사용자 외래 키를 두지 않는다.
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

-- Workspaces의 생성, 의미 있는 수정, 소프트 삭제를 워크스페이스 이벤트로 변환한다.
CREATE FUNCTION log_workspace_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    changed_fields JSONB;
BEGIN
    -- 상위 트리거나 FK 연쇄 동작에서 다시 호출된 변경을 사용자 활동으로 오인하지 않게 한다.
    -- AFTER 트리거에서는 반환값이 행을 바꾸지 않지만, DELETE에는 NEW가 없으므로
    -- 트리거 함수의 일관된 반환 규약에 따라 OLD를, 그 외 연산에는 NEW를 반환한다.
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

    -- 물리 삭제는 유지보수나 개인정보 정리용이다. 사용자에게 보이는 삭제는
    -- deleted_at/deleted_by를 채우는 소프트 삭제로만 기록해 같은 삭제를 중복 집계하지 않는다.
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;

    -- deleted_at의 NULL→값은 사용자 삭제, 값→NULL은 복구다. 이미 삭제된 행의
    -- 후속 갱신은 활동에 노출하지 않아 상태 전환 하나만 대표 이벤트로 남긴다.
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

    -- 감사 컬럼만 자동 갱신된 경우를 제외하고 업무 필드의 실제 변경 여부를 확인한다.
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

-- WorkspaceMembers의 가입, 탈퇴, 복구, 역할 변경을 멤버 활동 이벤트로 변환한다.
CREATE FUNCTION log_workspace_member_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- 워크스페이스 물리 삭제로 멤버십이 연쇄 삭제되는 경우처럼,
    -- 다른 트리거 또는 FK 동작에서 호출된 변경을 사용자 활동으로 중복 기록하지 않는다.
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

    -- 물리 삭제는 유지보수 동작이므로 소프트 삭제와 별도로 활동에 노출하지 않는다.
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;

    -- 멤버십 소프트 삭제는 탈퇴, 복구는 재참여로 해석한다.
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

    -- 삭제 상태의 후속 수정과 역할이 그대로인 갱신은 활동으로 볼 변화가 없다.
    IF NEW.deleted_at IS NOT NULL OR NEW.role IS NOT DISTINCT FROM OLD.role THEN
        RETURN NEW;
    END IF;

    -- 삭제 상태가 아니면서 role이 실제로 달라진 UPDATE만 역할 변경으로 기록한다.
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

-- Lists의 생성, 수정, 순서 이동, 소프트 삭제를 리스트 활동 이벤트로 변환한다.
CREATE FUNCTION log_list_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    changed_fields JSONB;
    activity_event "ActivityEventType";
BEGIN
    -- 워크스페이스 물리 삭제가 리스트 삭제로 이어지는 것처럼,
    -- 상위 변경에서 연쇄 호출된 트리거를 별도 사용자 활동으로 기록하지 않는다.
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

    -- 사용자에게 보이는 삭제는 deleted_at 전환으로 표현하므로 실제 DELETE는 기록하지 않는다.
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;

    -- 리스트의 소프트 삭제와 복구는 각각 삭제와 일반 수정 이벤트로 표현한다.
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

    -- 자동으로 바뀌는 감사 컬럼을 제외하고 실제 리스트 데이터가 달라졌는지 확인한다.
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

    -- sequence는 보드에서의 위치이므로 변경 시 LIST_MOVED로 구분한다.
    -- 이름 등 나머지 업무 필드 변경은 LIST_UPDATED로 묶는다.
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

-- Cards의 생성, 수정, 이동, 완료 상태 변경, 소프트 삭제를 카드 활동 이벤트로 변환한다.
CREATE FUNCTION log_card_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    workspace_id_value UUID;
    changed_fields JSONB;
    activity_event "ActivityEventType";
BEGIN
    -- 리스트 물리 삭제의 ON DELETE SET NULL이 카드 이동처럼 보일 수 있으므로,
    -- 상위 트리거나 FK에서 연쇄 호출된 카드 변경은 사용자 활동으로 기록하지 않는다.
    IF pg_trigger_depth() > 1 THEN
        IF TG_OP = 'DELETE' THEN
            RETURN OLD;
        END IF;
        RETURN NEW;
    END IF;

    -- 물리 삭제는 사용자 활동이 아니며 DELETE에서는 NEW를 참조할 수도 없으므로 즉시 끝낸다.
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;

    -- 보드에 있는 카드는 현재 list_id를 통해 워크스페이스를 찾는다.
    -- 워크스페이스 ID를 카드에 중복 저장하지 않아 소속 정보의 단일 원천을 Lists로 유지한다.
    IF NEW.list_id IS NOT NULL THEN
        SELECT "workspace_id"
        INTO workspace_id_value
        FROM "Lists"
        WHERE "id" = NEW.list_id;
    -- 카드를 인박스로 옮기면 NEW.list_id가 NULL이므로, 이동 직전 워크스페이스에
    -- CARD_MOVED 이벤트를 남길 수 있도록 OLD.list_id를 대신 조회한다.
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

    -- 카드의 소프트 삭제와 복구는 각각 삭제와 일반 수정 이벤트로 표현한다.
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

    -- 감사 컬럼만 달라진 UPDATE를 걸러 실제 카드 내용이나 상태가 바뀐 경우만 남긴다.
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

    -- 완료 여부는 대시보드 지표에 직접 쓰이므로 이동보다 먼저 판별한다.
    -- 한 UPDATE에서 완료 상태와 위치가 함께 바뀌면 가장 의미가 큰 완료/재개 이벤트 하나를 남긴다.
    IF NEW.is_completed IS DISTINCT FROM OLD.is_completed THEN
        IF NEW.is_completed THEN
            activity_event := 'CARD_COMPLETED'::"ActivityEventType";
        ELSE
            activity_event := 'CARD_REOPENED'::"ActivityEventType";
        END IF;
    -- 리스트가 바뀌거나 같은 리스트 안에서 sequence만 바뀌어도 카드 이동이다.
    ELSIF NEW.list_id IS DISTINCT FROM OLD.list_id
          OR NEW.sequence IS DISTINCT FROM OLD.sequence THEN
        activity_event := 'CARD_MOVED'::"ActivityEventType";
    ELSE
        -- 제목, 설명, 날짜 등 나머지 업무 필드 변경은 일반 카드 수정으로 묶는다.
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

-- Comments의 생성, 수정, 소프트 삭제를 댓글 활동 이벤트로 변환한다.
CREATE FUNCTION log_comment_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    workspace_id_value UUID;
    changed_fields JSONB;
BEGIN
    -- 카드 물리 삭제가 댓글 삭제로 이어지는 것처럼,
    -- 상위 트리거나 FK에서 연쇄 호출된 댓글 변경은 사용자 활동으로 기록하지 않는다.
    IF pg_trigger_depth() > 1 THEN
        IF TG_OP = 'DELETE' THEN
            RETURN OLD;
        END IF;
        RETURN NEW;
    END IF;

    -- 물리 삭제는 유지보수 동작이며 DELETE에는 NEW가 없으므로 기록하지 않는다.
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;

    -- 댓글에는 workspace_id를 중복 저장하지 않으므로 카드와 리스트를 따라 소속을 찾는다.
    -- 인박스 카드에는 리스트가 없어 결과가 NULL이며 공통 기록 함수가 활동에서 제외한다.
    SELECT lists."workspace_id"
    INTO workspace_id_value
    FROM "Cards" AS cards
    JOIN "Lists" AS lists ON lists."id" = cards."list_id"
    WHERE cards."id" = NEW.card_id;

    -- 신규 댓글이 created_by를 생략해도 행동 주체가 비지 않도록 실제 작성자인
    -- user_id를 fallback으로 사용한다.
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

    -- 댓글의 소프트 삭제와 복구는 각각 삭제와 일반 수정 이벤트로 표현한다.
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

    -- 감사 컬럼만 자동 변경된 경우를 걸러 실제 댓글 내용 변경만 확인한다.
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

-- 행 변경이 제약조건과 DB 처리를 통과한 뒤의 최종 값을 기록하도록 모두 AFTER 트리거로 연결한다.
-- FOR EACH ROW를 사용해 한 SQL이 여러 행을 바꾸더라도 대상별 활동을 구분할 수 있다.
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

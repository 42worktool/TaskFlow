// ============================================================
// seed.ts — development fixtures
//   Run: npm run db:seed (after migrations)
//   Fixed IDs and upserts keep repeated runs deterministic.
// ============================================================
import { Prisma, PrismaClient } from '@prisma/client'
import { hashPassword } from '../src/modules/auth/auth.utils'

if (process.env.NODE_ENV === 'production' || process.env.ALLOW_DB_SEED !== 'true') {
  throw new Error('Database seed is allowed only in development')
}

function required(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required`)
  return value
}

const DEV_SEED_EMAIL = required('DEV_SEED_EMAIL')
const DEV_SEED_PASSWORD = required('DEV_SEED_PASSWORD')
const prisma = new PrismaClient()

const ids = {
  users: {
    owner: '00000000-0000-4000-8000-000000000001',
    admin: '00000000-0000-4000-8000-000000000002',
    member: '00000000-0000-4000-8000-000000000003',
    viewer: '00000000-0000-4000-8000-000000000004',
    guest: '00000000-0000-4000-8000-000000000005',
  },
  workspaces: {
    product: '00000000-0000-4000-8000-0000000000aa',
    openSource: '00000000-0000-4000-8000-0000000000bb',
  },
  lists: {
    backlog: '11111111-1111-4111-8111-000000000004',
    todo: '11111111-1111-4000-8000-000000000001',
    doing: '11111111-1111-4000-8000-000000000002',
    review: '11111111-1111-4111-8111-000000000005',
    done: '11111111-1111-4000-8000-000000000003',
    communityBacklog: '22222222-2222-4222-8222-000000000001',
    communityDoing: '22222222-2222-4222-8222-000000000002',
    communityDone: '22222222-2222-4222-8222-000000000003',
  },
  cards: {
    research: '33333333-3333-4333-8333-000000000001',
    analytics: '33333333-3333-4333-8333-000000000002',
    oauth: '33333333-3333-4333-8333-000000000003',
    onboarding: '33333333-3333-4333-8333-000000000004',
    search: '33333333-3333-4333-8333-000000000005',
    websocket: '33333333-3333-4333-8333-000000000006',
    calendar: '33333333-3333-4333-8333-000000000007',
    accessibility: '33333333-3333-4333-8333-000000000008',
    responsive: '33333333-3333-4333-8333-000000000009',
    invitation: '33333333-3333-4333-8333-000000000010',
    release: '33333333-3333-4333-8333-000000000011',
    database: '33333333-3333-4333-8333-000000000012',
    design: '33333333-3333-4333-8333-000000000013',
    apiDocs: '33333333-3333-4333-8333-000000000014',
    kickoff: '33333333-3333-4333-8333-000000000015',
    goodFirstIssue: '44444444-4444-4444-8444-000000000001',
    contributionGuide: '44444444-4444-4444-8444-000000000002',
    darkMode: '44444444-4444-4444-8444-000000000003',
    translations: '44444444-4444-4444-8444-000000000004',
    issueTemplate: '44444444-4444-4444-8444-000000000005',
    readme: '44444444-4444-4444-8444-000000000006',
    ownerInbox: '55555555-5555-4555-8555-000000000001',
    ownerReminder: '55555555-5555-4555-8555-000000000002',
    memberInbox: '55555555-5555-4555-8555-000000000003',
  },
  labels: {
    urgent: '66666666-6666-4666-8666-000000000001',
    bug: '66666666-6666-4666-8666-000000000002',
    feature: '66666666-6666-4666-8666-000000000003',
    design: '66666666-6666-4666-8666-000000000004',
    backend: '66666666-6666-4666-8666-000000000005',
    frontend: '66666666-6666-4666-8666-000000000006',
    community: '77777777-7777-4777-8777-000000000001',
    docs: '77777777-7777-4777-8777-000000000002',
    helpWanted: '77777777-7777-4777-8777-000000000003',
  },
} as const

export const DEV_WORKSPACE_ID = ids.workspaces.product

const fixtureWorkspaceIds = Object.values(ids.workspaces)

function dateFromNow(days: number, hour = 9): Date {
  const date = new Date()
  date.setUTCHours(hour, 0, 0, 0)
  date.setUTCDate(date.getUTCDate() + days)
  return date
}

function audit(userId: string) {
  return {
    created_by: userId,
    updated_by: userId,
    deleted_at: null,
    deleted_by: null,
  }
}

async function main() {
  const passwordHash = await hashPassword(DEV_SEED_PASSWORD)

  await prisma.$transaction(async (tx) => {
    const users = [
      { id: ids.users.owner, email: DEV_SEED_EMAIL, name: 'Dev Owner' },
      { id: ids.users.admin, email: 'alex.admin@local.test', name: 'Alex 관리자' },
      { id: ids.users.member, email: 'mina.member@local.test', name: '민아 Member' },
      { id: ids.users.viewer, email: 'joon.viewer@local.test', name: 'Joon Viewer' },
      { id: ids.users.guest, email: 'guest.pending@local.test', name: '게스트 사용자' },
    ]

    for (const user of users) {
      await tx.user.upsert({
        where: { id: user.id },
        update: {
          email: user.email,
          name: user.name,
          password_hash: passwordHash,
          profile_image_url: null,
          updated_by: ids.users.owner,
          deleted_at: null,
          deleted_by: null,
        },
        create: {
          ...user,
          password_hash: passwordHash,
          profile_image_url: null,
          ...audit(ids.users.owner),
        },
      })
    }

    const workspaces = [
      {
        id: ids.workspaces.product,
        name: 'TaskFlow Product Launch',
        is_public: false,
        actor: ids.users.owner,
      },
      {
        id: ids.workspaces.openSource,
        name: '오픈소스 Roadmap',
        is_public: true,
        actor: ids.users.admin,
      },
    ]

    for (const workspace of workspaces) {
      await tx.workspace.upsert({
        where: { id: workspace.id },
        update: {
          name: workspace.name,
          is_public: workspace.is_public,
          updated_by: workspace.actor,
          deleted_at: null,
          deleted_by: null,
        },
        create: {
          id: workspace.id,
          name: workspace.name,
          is_public: workspace.is_public,
          ...audit(workspace.actor),
        },
      })
    }

    const memberships = [
      [ids.workspaces.product, ids.users.owner, 'OWNER'],
      [ids.workspaces.product, ids.users.admin, 'ADMIN'],
      [ids.workspaces.product, ids.users.member, 'MEMBER'],
      [ids.workspaces.product, ids.users.viewer, 'VIEWER'],
      [ids.workspaces.openSource, ids.users.admin, 'OWNER'],
      [ids.workspaces.openSource, ids.users.owner, 'MEMBER'],
      [ids.workspaces.openSource, ids.users.member, 'VIEWER'],
    ] as const

    for (const [workspaceId, userId, role] of memberships) {
      await tx.workspaceMember.upsert({
        where: { workspace_id_user_id: { workspace_id: workspaceId, user_id: userId } },
        update: {
          role,
          updated_by: ids.users.owner,
          deleted_at: null,
          deleted_by: null,
        },
        create: {
          workspace_id: workspaceId,
          user_id: userId,
          role,
          ...audit(ids.users.owner),
        },
      })
    }

    const lists = [
      [ids.lists.backlog, ids.workspaces.product, 'Backlog / 아이디어', 1024],
      [ids.lists.todo, ids.workspaces.product, 'To Do', 2048],
      [ids.lists.doing, ids.workspaces.product, 'In Progress', 3072],
      [ids.lists.review, ids.workspaces.product, 'Review / 검수', 4096],
      [ids.lists.done, ids.workspaces.product, 'Done', 5120],
      [ids.lists.communityBacklog, ids.workspaces.openSource, 'Community Backlog', 1024],
      [ids.lists.communityDoing, ids.workspaces.openSource, 'Contributors 작업 중', 2048],
      [ids.lists.communityDone, ids.workspaces.openSource, 'Released', 3072],
    ] as const

    for (const [id, workspaceId, name, sequence] of lists) {
      await tx.list.upsert({
        where: { id },
        update: {
          workspace_id: workspaceId,
          name,
          sequence,
          updated_by: ids.users.owner,
          deleted_at: null,
          deleted_by: null,
        },
        create: {
          id,
          workspace_id: workspaceId,
          name,
          sequence,
          ...audit(ids.users.owner),
        },
      })
    }

    await tx.card.deleteMany({
      where: {
        created_by: ids.users.owner,
        OR: [
          { list_id: ids.lists.todo, title: '할 일 1', description: '첫 번 째 할 일' },
          { list_id: ids.lists.todo, title: '할 일 2', description: '두 번 째 할 일' },
          { list_id: ids.lists.doing, title: '하는 중', description: '하고 있음' },
          { list_id: ids.lists.doing, title: '하고 있는데', description: '하고 있음' },
          { list_id: ids.lists.done, title: '다 함', description: '끝' },
          { list_id: ids.lists.done, title: '완', description: '끝' },
        ],
      },
    })

    const cards = [
      { id: ids.cards.research, list_id: ids.lists.backlog, user_id: null, title: '사용자 인터뷰 결과 정리', description: '인터뷰 메모를 정리하고 launch scope에 반영합니다.', is_completed: false, start_at: null, deadline: null, sequence: 1024, actor: ids.users.member, created_at: dateFromNow(-24) },
      { id: ids.cards.analytics, list_id: ids.lists.backlog, user_id: null, title: 'Analytics event taxonomy', description: '핵심 행동 이벤트와 naming convention 초안 작성.', is_completed: false, start_at: dateFromNow(7), deadline: dateFromNow(12), sequence: 2048, actor: ids.users.admin, created_at: dateFromNow(-20) },
      { id: ids.cards.oauth, list_id: ids.lists.backlog, user_id: null, title: 'Google OAuth edge cases', description: '계정 연결과 callback 실패 시나리오를 점검합니다.', is_completed: false, start_at: null, deadline: dateFromNow(14), sequence: 3072, actor: ids.users.owner, created_at: dateFromNow(-18) },
      { id: ids.cards.onboarding, list_id: ids.lists.todo, user_id: null, title: '온보딩 체크리스트 개선', description: '첫 로그인부터 workspace 생성까지 안내 문구를 다듬습니다.', is_completed: false, start_at: dateFromNow(-5), deadline: dateFromNow(-2), sequence: 1024, actor: ids.users.member, created_at: dateFromNow(-16) },
      { id: ids.cards.search, list_id: ids.lists.todo, user_id: null, title: 'Cross-workspace search QA', description: '한국어/English 검색어와 권한별 결과를 확인합니다.', is_completed: false, start_at: dateFromNow(1), deadline: dateFromNow(3), sequence: 2048, actor: ids.users.admin, created_at: dateFromNow(-12) },
      { id: ids.cards.websocket, list_id: ids.lists.todo, user_id: null, title: 'WebSocket reconnect 테스트', description: '네트워크 단절 후 snapshot reconciliation을 확인합니다.', is_completed: false, start_at: dateFromNow(2), deadline: dateFromNow(5), sequence: 3072, actor: ids.users.owner, created_at: dateFromNow(-10) },
      { id: ids.cards.calendar, list_id: ids.lists.doing, user_id: null, title: 'Calendar weekly bar polish', description: '주 경계를 넘는 일정 바와 mobile layout을 검수합니다.', is_completed: false, start_at: dateFromNow(-1), deadline: dateFromNow(4), sequence: 1024, actor: ids.users.member, created_at: dateFromNow(-14) },
      { id: ids.cards.accessibility, list_id: ids.lists.doing, user_id: null, title: '접근성 keyboard audit', description: 'Modal focus trap, tab order, aria-label을 점검합니다.', is_completed: false, start_at: dateFromNow(-3), deadline: dateFromNow(0), sequence: 2048, actor: ids.users.admin, created_at: dateFromNow(-11) },
      { id: ids.cards.responsive, list_id: ids.lists.doing, user_id: null, title: 'Responsive board performance', description: '긴 제목과 많은 카드가 있는 모바일 보드 성능을 확인합니다.', is_completed: false, start_at: dateFromNow(0), deadline: dateFromNow(7), sequence: 3072, actor: ids.users.owner, created_at: dateFromNow(-8) },
      { id: ids.cards.invitation, list_id: ids.lists.review, user_id: null, title: '초대 이메일 copy review', description: '한영 혼합 초대 문구와 만료 안내를 최종 검수합니다.', is_completed: false, start_at: dateFromNow(-2), deadline: dateFromNow(1), sequence: 1024, actor: ids.users.admin, created_at: dateFromNow(-9) },
      { id: ids.cards.release, list_id: ids.lists.review, user_id: null, title: 'Release checklist v1.0', description: '배포 전 migration, health check, rollback 항목을 확인합니다.', is_completed: false, start_at: dateFromNow(0), deadline: dateFromNow(2), sequence: 2048, actor: ids.users.owner, created_at: dateFromNow(-7) },
      { id: ids.cards.database, list_id: ids.lists.review, user_id: null, title: 'Database backup drill', description: '복구 절차와 예상 소요 시간을 기록합니다.', is_completed: false, start_at: dateFromNow(3), deadline: dateFromNow(4), sequence: 3072, actor: ids.users.admin, created_at: dateFromNow(-5) },
      { id: ids.cards.design, list_id: ids.lists.done, user_id: null, title: 'Design tokens 정리', description: 'Color, spacing, radius token을 공통 스타일로 정리했습니다.', is_completed: true, start_at: dateFromNow(-18), deadline: dateFromNow(-14), sequence: 1024, actor: ids.users.member, created_at: dateFromNow(-22) },
      { id: ids.cards.apiDocs, list_id: ids.lists.done, user_id: null, title: 'API docs refresh', description: 'Swagger examples와 error response 문서를 갱신했습니다.', is_completed: true, start_at: dateFromNow(-12), deadline: dateFromNow(-9), sequence: 2048, actor: ids.users.admin, created_at: dateFromNow(-15) },
      { id: ids.cards.kickoff, list_id: ids.lists.done, user_id: null, title: 'Product launch kickoff', description: '목표, 역할, milestone 합의를 완료했습니다.', is_completed: true, start_at: dateFromNow(-28), deadline: dateFromNow(-27), sequence: 3072, actor: ids.users.owner, created_at: dateFromNow(-29) },
      { id: ids.cards.goodFirstIssue, list_id: ids.lists.communityBacklog, user_id: null, title: 'Good first issue 후보 정리', description: '작고 독립적인 contributor task를 선별합니다.', is_completed: false, start_at: null, deadline: null, sequence: 1024, actor: ids.users.owner, created_at: dateFromNow(-13) },
      { id: ids.cards.contributionGuide, list_id: ids.lists.communityBacklog, user_id: null, title: 'Contribution guide 번역', description: 'English guide와 한국어 안내를 함께 제공합니다.', is_completed: false, start_at: dateFromNow(5), deadline: dateFromNow(10), sequence: 2048, actor: ids.users.member, created_at: dateFromNow(-10) },
      { id: ids.cards.darkMode, list_id: ids.lists.communityDoing, user_id: null, title: 'Dark mode color audit', description: 'Contrast ratio와 status color를 검토합니다.', is_completed: false, start_at: dateFromNow(-2), deadline: dateFromNow(6), sequence: 1024, actor: ids.users.admin, created_at: dateFromNow(-9) },
      { id: ids.cards.translations, list_id: ids.lists.communityDoing, user_id: null, title: 'Community translations', description: '메뉴와 empty state 번역 누락을 찾습니다.', is_completed: false, start_at: dateFromNow(0), deadline: dateFromNow(8), sequence: 2048, actor: ids.users.owner, created_at: dateFromNow(-6) },
      { id: ids.cards.issueTemplate, list_id: ids.lists.communityDone, user_id: null, title: 'Bug report template', description: '재현 단계와 환경 정보를 받는 template을 배포했습니다.', is_completed: true, start_at: dateFromNow(-16), deadline: dateFromNow(-15), sequence: 1024, actor: ids.users.admin, created_at: dateFromNow(-17) },
      { id: ids.cards.readme, list_id: ids.lists.communityDone, user_id: null, title: 'README quick start', description: '로컬 실행과 contribution flow를 문서화했습니다.', is_completed: true, start_at: dateFromNow(-11), deadline: dateFromNow(-8), sequence: 2048, actor: ids.users.owner, created_at: dateFromNow(-12) },
      { id: ids.cards.ownerInbox, list_id: null, user_id: ids.users.owner, title: '개인 메모: demo flow 연습', description: 'Board → Calendar → Dashboard → Messenger 순서로 시연합니다.', is_completed: false, start_at: null, deadline: dateFromNow(1), sequence: 1024, actor: ids.users.owner, created_at: dateFromNow(-2) },
      { id: ids.cards.ownerReminder, list_id: null, user_id: ids.users.owner, title: 'Follow up with beta users', description: '다음 주 feedback session 일정을 잡습니다.', is_completed: false, start_at: dateFromNow(4), deadline: dateFromNow(4), sequence: 2048, actor: ids.users.owner, created_at: dateFromNow(-1) },
      { id: ids.cards.memberInbox, list_id: null, user_id: ids.users.member, title: '민아 개인 Inbox', description: '공유 전 초안을 개인 Inbox에서 정리합니다.', is_completed: false, start_at: null, deadline: null, sequence: 1024, actor: ids.users.member, created_at: dateFromNow(-1) },
    ]

    for (const card of cards) {
      await tx.card.upsert({
        where: { id: card.id },
        update: {
          list_id: card.list_id,
          user_id: card.user_id,
          title: card.title,
          description: card.description,
          is_completed: card.is_completed,
          start_at: card.start_at,
          deadline: card.deadline,
          sequence: card.sequence,
          created_at: card.created_at,
          updated_by: card.actor,
          deleted_at: null,
          deleted_by: null,
        },
        create: {
          id: card.id,
          list_id: card.list_id,
          user_id: card.user_id,
          title: card.title,
          description: card.description,
          is_completed: card.is_completed,
          start_at: card.start_at,
          deadline: card.deadline,
          sequence: card.sequence,
          created_at: card.created_at,
          ...audit(card.actor),
        },
      })
    }

    const labels = [
      [ids.labels.urgent, ids.workspaces.product, '긴급 / Urgent', '#ef4444'],
      [ids.labels.bug, ids.workspaces.product, 'Bug', '#f97316'],
      [ids.labels.feature, ids.workspaces.product, 'Feature', '#22c55e'],
      [ids.labels.design, ids.workspaces.product, 'Design', '#a855f7'],
      [ids.labels.backend, ids.workspaces.product, 'Backend', '#3b82f6'],
      [ids.labels.frontend, ids.workspaces.product, 'Frontend', '#06b6d4'],
      [ids.labels.community, ids.workspaces.openSource, 'Community', '#22c55e'],
      [ids.labels.docs, ids.workspaces.openSource, '문서 / Docs', '#6366f1'],
      [ids.labels.helpWanted, ids.workspaces.openSource, 'Help wanted', '#eab308'],
    ] as const

    for (const [id, workspaceId, labelName, labelColor] of labels) {
      await tx.label.upsert({
        where: { id },
        update: {
          workspace_id: workspaceId,
          label_name: labelName,
          label_color: labelColor,
          updated_by: ids.users.owner,
          deleted_at: null,
          deleted_by: null,
        },
        create: {
          id,
          workspace_id: workspaceId,
          label_name: labelName,
          label_color: labelColor,
          ...audit(ids.users.owner),
        },
      })
    }

    const cardMembers = [
      [ids.cards.onboarding, ids.users.member], [ids.cards.onboarding, ids.users.admin],
      [ids.cards.search, ids.users.admin], [ids.cards.websocket, ids.users.owner],
      [ids.cards.calendar, ids.users.member], [ids.cards.calendar, ids.users.owner],
      [ids.cards.accessibility, ids.users.admin], [ids.cards.accessibility, ids.users.viewer],
      [ids.cards.responsive, ids.users.owner], [ids.cards.invitation, ids.users.admin],
      [ids.cards.release, ids.users.owner], [ids.cards.release, ids.users.member],
      [ids.cards.database, ids.users.admin], [ids.cards.darkMode, ids.users.admin],
      [ids.cards.translations, ids.users.owner],
    ] as const

    for (const [cardId, userId] of cardMembers) {
      await tx.cardMember.upsert({
        where: { card_id_user_id: { card_id: cardId, user_id: userId } },
        update: { updated_by: ids.users.owner, deleted_at: null, deleted_by: null },
        create: { card_id: cardId, user_id: userId, ...audit(ids.users.owner) },
      })
    }

    const cardLabels = [
      [ids.cards.onboarding, ids.labels.urgent], [ids.cards.onboarding, ids.labels.design],
      [ids.cards.search, ids.labels.feature], [ids.cards.search, ids.labels.backend],
      [ids.cards.websocket, ids.labels.bug], [ids.cards.websocket, ids.labels.backend],
      [ids.cards.calendar, ids.labels.feature], [ids.cards.calendar, ids.labels.frontend],
      [ids.cards.accessibility, ids.labels.urgent], [ids.cards.accessibility, ids.labels.frontend],
      [ids.cards.responsive, ids.labels.frontend], [ids.cards.invitation, ids.labels.design],
      [ids.cards.release, ids.labels.urgent], [ids.cards.release, ids.labels.backend],
      [ids.cards.database, ids.labels.backend], [ids.cards.design, ids.labels.design],
      [ids.cards.goodFirstIssue, ids.labels.community], [ids.cards.goodFirstIssue, ids.labels.helpWanted],
      [ids.cards.contributionGuide, ids.labels.docs], [ids.cards.darkMode, ids.labels.helpWanted],
      [ids.cards.translations, ids.labels.community], [ids.cards.issueTemplate, ids.labels.docs],
      [ids.cards.readme, ids.labels.docs],
    ] as const

    for (const [cardId, labelId] of cardLabels) {
      await tx.cardLabel.upsert({
        where: { label_id_card_id: { label_id: labelId, card_id: cardId } },
        update: { updated_by: ids.users.owner, deleted_at: null, deleted_by: null },
        create: { label_id: labelId, card_id: cardId, ...audit(ids.users.owner) },
      })
    }

    const attachments = [
      ['88888888-8888-4888-8888-000000000001', ids.cards.calendar, 'https://example.com/taskflow/calendar-wireframe.pdf', 'calendar-wireframe.pdf', ids.users.member],
      ['88888888-8888-4888-8888-000000000002', ids.cards.release, 'https://example.com/taskflow/release-checklist.md', 'release-checklist.md', ids.users.owner],
      ['88888888-8888-4888-8888-000000000003', ids.cards.darkMode, 'https://example.com/taskflow/color-audit.png', 'color-audit.png', ids.users.admin],
    ] as const

    for (const [id, cardId, fileUrl, fileName, actor] of attachments) {
      await tx.attachment.upsert({
        where: { id },
        update: { card_id: cardId, file_url: fileUrl, file_name: fileName, updated_by: actor, deleted_at: null, deleted_by: null },
        create: { id, card_id: cardId, file_url: fileUrl, file_name: fileName, ...audit(actor) },
      })
    }

    const comments = [
      ['aaaaaaaa-aaaa-4aaa-8aaa-000000000001', ids.cards.onboarding, ids.users.admin, '첫 화면 CTA가 조금 더 명확하면 좋겠어요.', -4],
      ['aaaaaaaa-aaaa-4aaa-8aaa-000000000002', ids.cards.onboarding, ids.users.member, 'Copy 수정안 반영했습니다. Please review!', -3],
      ['aaaaaaaa-aaaa-4aaa-8aaa-000000000003', ids.cards.calendar, ids.users.owner, '주 경계에서 bar가 끊기지 않는지 확인 부탁해요.', -2],
      ['aaaaaaaa-aaaa-4aaa-8aaa-000000000004', ids.cards.calendar, ids.users.member, 'Desktop/mobile 모두 확인했고 screenshot 첨부했습니다.', -1],
      ['aaaaaaaa-aaaa-4aaa-8aaa-000000000005', ids.cards.accessibility, ids.users.viewer, 'Keyboard only navigation에서 modal close가 어렵습니다.', -1],
      ['aaaaaaaa-aaaa-4aaa-8aaa-000000000006', ids.cards.release, ids.users.admin, 'Migration dry-run completed successfully.', 0],
      ['aaaaaaaa-aaaa-4aaa-8aaa-000000000007', ids.cards.database, ids.users.owner, '복구 목표 시간은 15분으로 기록해주세요.', 0],
      ['aaaaaaaa-aaaa-4aaa-8aaa-000000000008', ids.cards.goodFirstIssue, ids.users.owner, '초보 contributor가 재현 가능한 항목 위주로 골라주세요.', -5],
      ['aaaaaaaa-aaaa-4aaa-8aaa-000000000009', ids.cards.darkMode, ids.users.admin, 'Status colors need one more contrast pass.', -2],
      ['aaaaaaaa-aaaa-4aaa-8aaa-000000000010', ids.cards.readme, ids.users.member, '한국어 quick start 링크도 추가했습니다.', -7],
    ] as const

    for (const [id, cardId, userId, commentStr, days] of comments) {
      const createdAt = dateFromNow(days, 13)
      await tx.comment.upsert({
        where: { id },
        update: { card_id: cardId, user_id: userId, comment_str: commentStr, created_at: createdAt, updated_by: userId, deleted_at: null, deleted_by: null },
        create: { id, card_id: cardId, user_id: userId, comment_str: commentStr, created_at: createdAt, ...audit(userId) },
      })
    }

    const workspaceMessages = [
      ['bbbbbbbb-bbbb-4bbb-8bbb-000000000001', ids.workspaces.product, ids.users.owner, null, '오늘 stand-up 시작합니다. Blocker 있으면 공유해주세요.', -3, 1],
      ['bbbbbbbb-bbbb-4bbb-8bbb-000000000002', ids.workspaces.product, ids.users.member, ids.cards.calendar, 'Calendar polish 진행 상황 공유드립니다.', -3, 2],
      ['bbbbbbbb-bbbb-4bbb-8bbb-000000000003', ids.workspaces.product, ids.users.admin, null, 'OAuth QA checklist를 Review에 올려주세요.', -2, 4],
      ['bbbbbbbb-bbbb-4bbb-8bbb-000000000004', ids.workspaces.product, ids.users.viewer, ids.cards.accessibility, 'Keyboard audit에서 blocker 하나 발견했습니다.', -1, 5],
      ['bbbbbbbb-bbbb-4bbb-8bbb-000000000005', ids.workspaces.product, ids.users.owner, ids.cards.release, 'Release checklist 기준으로 final check 진행할게요.', -1, 7],
      ['bbbbbbbb-bbbb-4bbb-8bbb-000000000006', ids.workspaces.product, ids.users.admin, null, 'Staging health check is green ✅', 0, 1],
      ['bbbbbbbb-bbbb-4bbb-8bbb-000000000007', ids.workspaces.product, ids.users.member, null, 'Demo data와 screenshots 업데이트했습니다.', 0, 2],
      ['bbbbbbbb-bbbb-4bbb-8bbb-000000000008', ids.workspaces.product, ids.users.owner, null, 'Great work team. 오후에 demo rehearsal 합시다!', 0, 3],
      ['bbbbbbbb-bbbb-4bbb-8bbb-000000000009', ids.workspaces.openSource, ids.users.admin, null, 'Welcome contributors! 이번 주 roadmap 공유합니다.', -3, 6],
      ['bbbbbbbb-bbbb-4bbb-8bbb-000000000010', ids.workspaces.openSource, ids.users.owner, ids.cards.goodFirstIssue, 'Good first issue 후보에 의견 남겨주세요.', -2, 7],
      ['bbbbbbbb-bbbb-4bbb-8bbb-000000000011', ids.workspaces.openSource, ids.users.member, null, 'Translation draft is ready for review.', -1, 8],
    ] as const

    for (const [id, workspaceId, userId, cardId, content, days, hour] of workspaceMessages) {
      const createdAt = dateFromNow(days, hour)
      await tx.workspaceMessage.upsert({
        where: { id },
        update: { workspace_id: workspaceId, user_id: userId, card_id: cardId, content, created_at: createdAt },
        create: { id, workspace_id: workspaceId, user_id: userId, card_id: cardId, content, created_at: createdAt },
      })
    }

    const friendships = [
      [ids.users.owner, ids.users.admin, -40],
      [ids.users.owner, ids.users.member, -18],
    ] as const

    for (const [userLowId, userHighId, days] of friendships) {
      await tx.friendship.upsert({
        where: { user_low_id_user_high_id: { user_low_id: userLowId, user_high_id: userHighId } },
        update: { created_at: dateFromNow(days) },
        create: { user_low_id: userLowId, user_high_id: userHighId, created_at: dateFromNow(days) },
      })
    }

    const friendRequests = [
      [ids.users.owner, ids.users.viewer, ids.users.viewer, -2],
      [ids.users.owner, ids.users.guest, ids.users.owner, -1],
    ] as const

    for (const [userLowId, userHighId, requestedById, days] of friendRequests) {
      await tx.friendRequest.upsert({
        where: { user_low_id_user_high_id: { user_low_id: userLowId, user_high_id: userHighId } },
        update: { requested_by_id: requestedById, created_at: dateFromNow(days) },
        create: { user_low_id: userLowId, user_high_id: userHighId, requested_by_id: requestedById, created_at: dateFromNow(days) },
      })
    }

    const directMessages = [
      ['cccccccc-cccc-4ccc-8ccc-000000000001', ids.users.owner, ids.users.admin, '내일 release review 가능하세요?', -2, 2],
      ['cccccccc-cccc-4ccc-8ccc-000000000002', ids.users.admin, ids.users.owner, '네, 오후 2시가 좋아요.', -2, 3],
      ['cccccccc-cccc-4ccc-8ccc-000000000003', ids.users.owner, ids.users.admin, 'Great, calendar invite 보냈습니다.', -2, 4],
      ['cccccccc-cccc-4ccc-8ccc-000000000004', ids.users.admin, ids.users.owner, '확인했습니다 👍', -2, 5],
      ['cccccccc-cccc-4ccc-8ccc-000000000005', ids.users.member, ids.users.owner, 'Demo flow feedback 받을 수 있을까요?', -1, 6],
      ['cccccccc-cccc-4ccc-8ccc-000000000006', ids.users.owner, ids.users.member, '물론이죠. 오늘 stand-up 뒤에 같이 봐요.', -1, 7],
    ] as const

    for (const [id, senderUserId, recipientUserId, content, days, hour] of directMessages) {
      const createdAt = dateFromNow(days, hour)
      await tx.directMessage.upsert({
        where: { id },
        update: { sender_user_id: senderUserId, recipient_user_id: recipientUserId, content, created_at: createdAt },
        create: { id, sender_user_id: senderUserId, recipient_user_id: recipientUserId, content, created_at: createdAt },
      })
    }

    const activity = (data: Prisma.ActivityLogCreateManyInput) => data
    const activityLogs = [
      activity({ id: 'dddddddd-dddd-4ddd-8ddd-000000000001', workspace_id: ids.workspaces.product, actor_user_id: ids.users.owner, operation: 'INSERT', event_type: 'MEMBER_ADDED', target_type: 'MEMBER', target_id: ids.users.admin, transaction_id: 1001n, created_at: dateFromNow(-28) }),
      activity({ id: 'dddddddd-dddd-4ddd-8ddd-000000000002', workspace_id: ids.workspaces.product, actor_user_id: ids.users.owner, operation: 'INSERT', event_type: 'LIST_CREATED', target_type: 'LIST', target_id: ids.lists.backlog, transaction_id: 1002n, created_at: dateFromNow(-25) }),
      activity({ id: 'dddddddd-dddd-4ddd-8ddd-000000000003', workspace_id: ids.workspaces.product, actor_user_id: ids.users.member, operation: 'INSERT', event_type: 'CARD_CREATED', target_type: 'CARD', target_id: ids.cards.design, transaction_id: 1003n, created_at: dateFromNow(-22) }),
      activity({ id: 'dddddddd-dddd-4ddd-8ddd-000000000004', workspace_id: ids.workspaces.product, actor_user_id: ids.users.admin, operation: 'INSERT', event_type: 'COMMENT_CREATED', target_type: 'COMMENT', target_id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001', transaction_id: 1004n, created_at: dateFromNow(-18) }),
      activity({ id: 'dddddddd-dddd-4ddd-8ddd-000000000005', workspace_id: ids.workspaces.product, actor_user_id: ids.users.owner, operation: 'UPDATE', event_type: 'CARD_MOVED', target_type: 'CARD', target_id: ids.cards.design, transaction_id: 1005n, created_at: dateFromNow(-15) }),
      activity({ id: 'dddddddd-dddd-4ddd-8ddd-000000000006', workspace_id: ids.workspaces.product, actor_user_id: ids.users.member, operation: 'UPDATE', event_type: 'CARD_COMPLETED', target_type: 'CARD', target_id: ids.cards.design, transaction_id: 1006n, created_at: dateFromNow(-14) }),
      activity({ id: 'dddddddd-dddd-4ddd-8ddd-000000000007', workspace_id: ids.workspaces.product, actor_user_id: ids.users.admin, operation: 'INSERT', event_type: 'CARD_CREATED', target_type: 'CARD', target_id: ids.cards.apiDocs, transaction_id: 1007n, created_at: dateFromNow(-12) }),
      activity({ id: 'dddddddd-dddd-4ddd-8ddd-000000000008', workspace_id: ids.workspaces.product, actor_user_id: ids.users.admin, operation: 'UPDATE', event_type: 'CARD_COMPLETED', target_type: 'CARD', target_id: ids.cards.apiDocs, transaction_id: 1008n, created_at: dateFromNow(-9) }),
      activity({ id: 'dddddddd-dddd-4ddd-8ddd-000000000009', workspace_id: ids.workspaces.product, actor_user_id: ids.users.owner, operation: 'UPDATE', event_type: 'MEMBER_ROLE_CHANGED', target_type: 'MEMBER', target_id: ids.users.viewer, transaction_id: 1009n, created_at: dateFromNow(-7) }),
      activity({ id: 'dddddddd-dddd-4ddd-8ddd-000000000010', workspace_id: ids.workspaces.product, actor_user_id: ids.users.member, operation: 'INSERT', event_type: 'CARD_CREATED', target_type: 'CARD', target_id: ids.cards.calendar, transaction_id: 1010n, created_at: dateFromNow(-5) }),
      activity({ id: 'dddddddd-dddd-4ddd-8ddd-000000000011', workspace_id: ids.workspaces.product, actor_user_id: ids.users.member, operation: 'INSERT', event_type: 'COMMENT_CREATED', target_type: 'COMMENT', target_id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000004', transaction_id: 1011n, created_at: dateFromNow(-3) }),
      activity({ id: 'dddddddd-dddd-4ddd-8ddd-000000000012', workspace_id: ids.workspaces.product, actor_user_id: ids.users.admin, operation: 'UPDATE', event_type: 'CARD_UPDATED', target_type: 'CARD', target_id: ids.cards.accessibility, transaction_id: 1012n, created_at: dateFromNow(-2) }),
      activity({ id: 'dddddddd-dddd-4ddd-8ddd-000000000013', workspace_id: ids.workspaces.product, actor_user_id: ids.users.owner, operation: 'UPDATE', event_type: 'CARD_MOVED', target_type: 'CARD', target_id: ids.cards.release, transaction_id: 1013n, created_at: dateFromNow(-1) }),
      activity({ id: 'dddddddd-dddd-4ddd-8ddd-000000000014', workspace_id: ids.workspaces.product, actor_user_id: ids.users.admin, operation: 'INSERT', event_type: 'COMMENT_CREATED', target_type: 'COMMENT', target_id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000006', transaction_id: 1014n, created_at: dateFromNow(0) }),
      activity({ id: 'eeeeeeee-eeee-4eee-8eee-000000000001', workspace_id: ids.workspaces.openSource, actor_user_id: ids.users.admin, operation: 'INSERT', event_type: 'MEMBER_ADDED', target_type: 'MEMBER', target_id: ids.users.owner, transaction_id: 2001n, created_at: dateFromNow(-20) }),
      activity({ id: 'eeeeeeee-eeee-4eee-8eee-000000000002', workspace_id: ids.workspaces.openSource, actor_user_id: ids.users.owner, operation: 'INSERT', event_type: 'CARD_CREATED', target_type: 'CARD', target_id: ids.cards.goodFirstIssue, transaction_id: 2002n, created_at: dateFromNow(-13) }),
      activity({ id: 'eeeeeeee-eeee-4eee-8eee-000000000003', workspace_id: ids.workspaces.openSource, actor_user_id: ids.users.admin, operation: 'INSERT', event_type: 'CARD_CREATED', target_type: 'CARD', target_id: ids.cards.issueTemplate, transaction_id: 2003n, created_at: dateFromNow(-10) }),
      activity({ id: 'eeeeeeee-eeee-4eee-8eee-000000000004', workspace_id: ids.workspaces.openSource, actor_user_id: ids.users.admin, operation: 'UPDATE', event_type: 'CARD_COMPLETED', target_type: 'CARD', target_id: ids.cards.issueTemplate, transaction_id: 2004n, created_at: dateFromNow(-8) }),
      activity({ id: 'eeeeeeee-eeee-4eee-8eee-000000000005', workspace_id: ids.workspaces.openSource, actor_user_id: ids.users.member, operation: 'INSERT', event_type: 'COMMENT_CREATED', target_type: 'COMMENT', target_id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000010', transaction_id: 2005n, created_at: dateFromNow(-7) }),
      activity({ id: 'eeeeeeee-eeee-4eee-8eee-000000000006', workspace_id: ids.workspaces.openSource, actor_user_id: ids.users.owner, operation: 'UPDATE', event_type: 'CARD_UPDATED', target_type: 'CARD', target_id: ids.cards.translations, transaction_id: 2006n, created_at: dateFromNow(-1) }),
    ]

    await tx.activityLog.deleteMany({
      where: { workspace_id: { in: fixtureWorkspaceIds } },
    })
    await tx.activityLog.createMany({ data: activityLogs })
  }, { timeout: 30_000 })

  console.log('Development fixtures seeded')
  console.log(`OWNER  ${DEV_SEED_EMAIL}`)
  console.log('ADMIN  alex.admin@local.test')
  console.log('MEMBER mina.member@local.test')
  console.log('VIEWER joon.viewer@local.test')
  console.log('GUEST  guest.pending@local.test')
  console.log('All fixture accounts use DEV_SEED_PASSWORD')
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())

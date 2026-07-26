// ============================================================
// seed.ts — 개발용 초기 데이터
//   실행: npm run db:seed  (마이그레이션이 먼저 적용되어 있어야 함)
//   upsert 를 쓰므로 여러 번 실행해도 중복 생성되지 않는다.
// ============================================================
import { PrismaClient } from '@prisma/client'
import { DEV_USER_ID } from '../src/config'

const prisma = new PrismaClient()

// 시드 데이터는 id 를 고정해 둔다 → curl 테스트할 때 id 를 매번
// 찾아 헤매지 않아도 되고, 문서/스크립트에 박아둘 수 있다.
export const DEV_WORKSPACE_ID = '00000000-0000-4000-8000-0000000000aa'

async function main() {
  // 1) 인증 스텁이 사용하는 개발 유저
  const user = await prisma.user.upsert({
    where: { id: DEV_USER_ID },
    update: {},
    create: {
      id: DEV_USER_ID,
      email: 'dev@local.test',
      name: '개발유저',
      password_hash: null,
      created_by: DEV_USER_ID,
      updated_by: DEV_USER_ID,
    },
  })

  // 2) 워크스페이스 + OWNER 멤버십
  await prisma.workspace.upsert({
    where: { id: DEV_WORKSPACE_ID },
    update: {},
    create: {
      id: DEV_WORKSPACE_ID,
      name: '개발용 워크스페이스',
      is_public: false,
      created_by: user.id,
      updated_by: user.id,
      members: {
        create: {
          user_id: user.id,
          role: 'OWNER',
          created_by: user.id,
          updated_by: user.id,
        },
      },
    },
  })

  // 3) 보드 렌더링 확인용 리스트 3개 + 카드
  //    sequence 는 fractional indexing용으로 1024 간격을 두고 부여한다.
  const LIST_TODO_ID = '11111111-1111-4000-8000-000000000001'
  const LIST_DOING_ID = '11111111-1111-4000-8000-000000000002'
  const LIST_DONE_ID = '11111111-1111-4000-8000-000000000003'

  await prisma.list.upsert({
    where: {id: LIST_TODO_ID},
    update: {},
    create: {
      id: LIST_TODO_ID,
      workspace_id: DEV_WORKSPACE_ID,
      name: 'To Do',
      sequence: 1024.0,
      created_by: user.id,
      updated_by: user.id,
      cards: {
        create: [
          {
            title: '할 일 1',
            description: '첫 번 째 할 일',
            sequence: 1024.0,
            created_by: user.id,
            updated_by: user.id,
          },
          {
            title: '할 일 2',
            description: '두 번 째 할 일',
            sequence: 2048.0,
            created_by: user.id,
            updated_by: user.id,
          },
        ],
      },
    },
  })

  await prisma.list.upsert({
    where: {id: LIST_DOING_ID},
    update: {},
    create: {
      id: LIST_DOING_ID,
      workspace_id: DEV_WORKSPACE_ID,
      name: 'In Progress',
      sequence: 2048.0,
      created_by: user.id,
      updated_by: user.id,
      cards: {
        create: [
          {
            title: '하는 중',
            description: '하고 있음',
            sequence: 1024.0,
            created_by: user.id,
            updated_by: user.id,
          },
          {
            title: '하고 있는데',
            description: '하고 있음',
            sequence: 2048.0,
            created_by: user.id,
            updated_by: user.id,
          },
        ],
      },
    },
  })

  
  await prisma.list.upsert({
    where: {id: LIST_DONE_ID},
    update: {},
    create: {
      id: LIST_DONE_ID,
      workspace_id: DEV_WORKSPACE_ID,
      name: 'Done',
      sequence: 3072.0,
      is_done: true,
      created_by: user.id,
      updated_by: user.id,
      cards: {
        create: [
          {
            title: '다 함',
            description: '끝',
            sequence: 1024.0,
            created_by: user.id,
            updated_by: user.id,
          },
          {
            title: '완',
            description: '끝',
            sequence: 2048.0,
            created_by: user.id,
            updated_by: user.id,
          },
        ],
      },
    },
  })

  console.log('시드 완료')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())

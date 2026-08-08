#!/bin/sh
set -e

# 애플리케이션보다 migration을 먼저 적용해 새 코드가 아직 없는 컬럼이나 테이블을
# 조회하는 상태를 만들지 않는다. 실패하면 set -e가 서버 시작도 중단한다.
npx prisma migrate deploy --schema ./prisma

# 운영 이미지는 production 단계에서 생성한 Prisma client와 build 단계의 dist를 사용해
# watch 프로세스 없이 실행한다.
if [ "$NODE_ENV" = "production" ]; then
  exec node dist/index.js
fi

# 개발 환경은 소스와 Prisma 스키마가 volume으로 교체될 수 있으므로 시작할 때 client를
# 다시 생성한다. exec로 PID 1을 넘겨 종료 신호가 실제 dev server에 전달되게 한다.
npx prisma generate --schema ./prisma
exec npm run dev

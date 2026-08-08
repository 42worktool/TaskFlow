import { PrismaClient } from '@prisma/client'

// Prisma 클라이언트는 애플리케이션 전체에서 하나만 공유한다.
// 개발 중 HMR/ts-node-dev 재시작 때마다 커넥션 풀이 새로 생기는 것을 막기 위해
// 이미 전역에 만든 인스턴스가 있으면 재사용한다.
const globalForPrisma = global as unknown as { prisma?: PrismaClient }

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}

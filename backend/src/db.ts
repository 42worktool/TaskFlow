import { PrismaClient } from '@prisma/client'

// Prisma 클라이언트 싱글톤. 모듈 전체에서 이 인스턴스를 공유한다.
// 개발 중 HMR/ts-node-dev 재시작 시 커넥션 누수를 막기 위해
// 전역에 이미 인스턴스가 있으면 재사용한다.
const globalForPrisma = global as unknown as { prisma?: PrismaClient }

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}

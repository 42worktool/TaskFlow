import { PrismaClient } from '@prisma/client'

// Prisma client singleton. This single instance is shared across the module.
// To prevent connection leaks during HMR / ts-node-dev restarts in dev,
// reuse an instance stored on the global object if one already exists.
const globalForPrisma = global as unknown as { prisma?: PrismaClient }

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}

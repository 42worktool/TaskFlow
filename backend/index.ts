import { createServer } from 'http'
import app from './src/app'
import { config } from './src/config'
import { prisma } from './src/db'
import { closeRedis } from './src/lib/redis'
import { startMailWorker, stopMailWorker } from './src/lib/mail-queue'
import { startPresence } from './src/modules/presence/presence.service'
import { startWorkspaceRealtime } from './src/modules/workspace/workspace.realtime'
import { realtime } from './src/realtime'

startMailWorker()
const stopPresence = startPresence()
const stopWorkspaceRealtime = startWorkspaceRealtime()

const server = createServer(app)
realtime.attach(server)
server.listen(config.port, () => {
  console.log(`Backend server is running on port ${config.port}`)
})

let shuttingDown = false

function closeHttpServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error)
      else resolve()
    })
  })
}

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`Received ${signal}, shutting down`)
  const presenceStopped = stopPresence()
  stopWorkspaceRealtime()

  const drainingResults = await Promise.allSettled([
    closeHttpServer(),
    realtime.close(),
    presenceStopped,
    stopMailWorker(),
  ])
  for (const result of drainingResults) {
    if (result.status === 'rejected') {
      console.error('Failed to drain a backend service during shutdown', result.reason)
    }
  }

  const dependencyResults = await Promise.allSettled([prisma.$disconnect(), closeRedis()])
  for (const result of dependencyResults) {
    if (result.status === 'rejected') {
      console.error('Failed to close a backend dependency during shutdown', result.reason)
    }
  }
  process.exit(0)
}

process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))

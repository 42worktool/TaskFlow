import { createServer } from 'http'
import app from './src/app'
import { config } from './src/config'
import { prisma } from './src/db'
import { closeRedis } from './src/lib/redis'
import { startMailWorker, stopMailWorker } from './src/lib/mail-queue'
import { startPresence } from './src/modules/presence/presence.service'
import { startWorkspaceRealtime } from './src/modules/workspace/workspace.realtime'
import { realtime } from './src/realtime'

// HTTP, 메일 큐, 접속 상태, 워크스페이스 구독을 한 진입점에서 시작해
// 프로세스의 생명주기와 각 백그라운드 서비스의 생명주기를 함께 관리한다.
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
  // SIGINT와 SIGTERM이 연달아 와도 종료 절차는 한 번만 실행한다.
  if (shuttingDown) return
  shuttingDown = true
  console.log(`Received ${signal}, shutting down`)
  const presenceStopped = stopPresence()
  stopWorkspaceRealtime()

  // 새 요청을 막은 뒤 이미 수락한 HTTP/WS 작업과 백그라운드 작업을 먼저 비운다.
  // 일부 서비스가 실패해도 나머지 정리와 DB/Redis 종료는 계속 진행해야 한다.
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

  // 애플리케이션 작업이 끝난 다음 공유 의존성을 닫아 종료 중 쿼리 실패를 피한다.
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

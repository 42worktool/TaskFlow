import { getRedisClient } from './redis'
import { sendMail, MailOptions } from './mailer'

const KEY = 'mail:queue'

let running = false
let done: (() => void) | null = null
let workerClient: Awaited<ReturnType<typeof getRedisClient>> | null = null

export async function enqueue(options: MailOptions): Promise<void> {
  const redis = await getRedisClient()
  await redis.lPush(KEY, JSON.stringify(options))
}

async function processJob(): Promise<void> {
  // BRPOP은 지정 시간 동안 연결을 점유한다. 일반 Redis 연결을 공유하면 다른 명령도
  // 매 폴링 뒤에 대기하므로, 메일 워커 전용 연결을 복제해 사용한다.
  const redis = await getRedisClient()
  workerClient = redis.duplicate()
  await workerClient.connect()

  while (running) {
    try {
      const result = await workerClient.brPop(KEY, 1)
      if (!result) continue
      const options = JSON.parse(result.element) as MailOptions
      await sendMail(options)
    } catch (err) {
      if (running) {
        console.error('[mail-queue] send failed:', err instanceof Error ? err.message : err)
      }
    }
  }

  await workerClient.quit()
  workerClient = null
  done?.()
}

export function startMailWorker(): void {
  if (running) return
  running = true
  processJob()
}

export function stopMailWorker(): Promise<void> {
  // 최초 stop은 최대 1초의 BRPOP 또는 진행 중 sendMail이 끝나 루프가 종료될 때 resolve한다.
  // BRPOP으로 꺼낸 뒤 전송에 실패한 메일을 재큐잉하지 않으므로 전달·재시도를 보장하지는 않는다.
  return new Promise((resolve) => {
    if (!running) return resolve()
    running = false
    done = resolve
  })
}

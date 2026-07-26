import { getRedisClient } from './redis';
import { sendMail, MailOptions } from './mailer';

const KEY = 'mail:queue';

let running = false;
let done: (() => void) | null = null;

export async function enqueue(options: MailOptions): Promise<void> {
  const redis = await getRedisClient();
  await redis.lPush(KEY, JSON.stringify(options));
}

async function processJob(): Promise<void> {
  const redis = await getRedisClient();
  while (running) {
    try {
      const result = await redis.brPop(KEY, 1);
      if (!result) continue;
      const options = JSON.parse(result.element) as MailOptions;
      await sendMail(options);
    } catch (err) {
      if (running) {
        console.error('[mail-queue] send failed:', err instanceof Error ? err.message : err);
      }
    }
  }
  done?.();
}

export function startMailWorker(): void {
  if (running) return;
  running = true;
  processJob();
}

export function stopMailWorker(): Promise<void> {
  return new Promise((resolve) => {
    if (!running) return resolve();
    running = false;
    done = resolve;
  });
}

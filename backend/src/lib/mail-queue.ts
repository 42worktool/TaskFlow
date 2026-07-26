import { getRedisClient } from './redis';
import { sendMail, MailOptions } from './mailer';

const KEY = 'mail:queue';

let running = false;

export async function enqueue(options: MailOptions): Promise<void> {
  const redis = await getRedisClient();
  await redis.lPush(KEY, JSON.stringify(options));
}

async function processJob(): Promise<void> {
  const redis = await getRedisClient();
  while (running) {
    const result = await redis.brPop(KEY, 1);
    if (!result) continue;
    try {
      const options = JSON.parse(result.element) as MailOptions;
      await sendMail(options);
    } catch (err) {
      console.error('[mail-queue] send failed:', err instanceof Error ? err.message : err);
    }
  }
}

export function startMailWorker(): void {
  if (running) return;
  running = true;
  processJob().catch((err) => {
    console.error('[mail-queue] worker crashed:', err);
    running = false;
  });
}

export async function stopMailWorker(): Promise<void> {
  running = false;
}

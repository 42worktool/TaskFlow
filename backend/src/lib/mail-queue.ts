import { getRedisClient } from './redis';
import { sendMail, MailOptions } from './mailer';

const KEY = 'mail:queue';

let running = false;
let done: (() => void) | null = null;
let workerClient: Awaited<ReturnType<typeof getRedisClient>> | null = null;

export async function enqueue(options: MailOptions): Promise<void> {
  const redis = await getRedisClient();
  await redis.lPush(KEY, JSON.stringify(options));
}

async function processJob(): Promise<void> {
  // BRPOP blocks the connection it runs on for up to the timeout, so it
  // needs its own dedicated connection — sharing the app's main client
  // would queue every other Redis command behind each blocking poll.
  const redis = await getRedisClient();
  workerClient = redis.duplicate();
  await workerClient.connect();

  while (running) {
    try {
      const result = await workerClient.brPop(KEY, 1);
      if (!result) continue;
      const options = JSON.parse(result.element) as MailOptions;
      await sendMail(options);
    } catch (err) {
      if (running) {
        console.error('[mail-queue] send failed:', err instanceof Error ? err.message : err);
      }
    }
  }

  await workerClient.quit();
  workerClient = null;
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

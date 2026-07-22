import { createClient } from 'redis';
import { config } from '../config';

const redis = createClient({ url: config.redisUrl });
let connectPromise: Promise<typeof redis> | null = null;

redis.on('error', (error) => {
  console.error('[redis] connection error', error instanceof Error ? error.message : error);
});

export async function getRedisClient(): Promise<typeof redis> {
  if (redis.isReady) return redis;
  if (!connectPromise) {
    connectPromise = redis.connect().then(() => redis).finally(() => {
      connectPromise = null;
    });
  }
  return connectPromise;
}

export async function closeRedis(): Promise<void> {
  if (redis.isOpen) await redis.quit();
}

import app from "./src/app";
import { config } from './src/config';
import { prisma } from './src/lib/prisma';
import { closeRedis } from './src/lib/redis';
import { startMailWorker, stopMailWorker } from './src/lib/mail-queue';

startMailWorker();

const server = app.listen(config.port, () => {
  console.log(`Backend server is running on port ${config.port}`);
});

async function shutdown(signal: string): Promise<void> {
  console.log(`Received ${signal}, shutting down`);
  server.close(async () => {
    await stopMailWorker();
    await Promise.allSettled([prisma.$disconnect(), closeRedis()]);
    process.exit(0);
  });
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

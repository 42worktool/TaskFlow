import { createServer } from 'http';
import app from './src/app';
import { config } from './src/config';
import { prisma } from './src/lib/prisma';
import { closeRedis } from './src/lib/redis';
import { startMailWorker, stopMailWorker } from './src/lib/mail-queue';
import { realtime } from './src/realtime';

startMailWorker();

const server = createServer(app);
realtime.attach(server);
server.listen(config.port, () => {
  console.log(`Backend server is running on port ${config.port}`);
});

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}, shutting down`);

  server.close();
  await Promise.allSettled([
    realtime.close(),
    stopMailWorker(),
    prisma.$disconnect(),
    closeRedis(),
  ]);
  server.closeAllConnections();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

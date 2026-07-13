import { initTracing } from '@interviewhub/shared';

// Tracing first: auto-instrumentations must register before express/undici load,
// which is why the app is pulled in via dynamic import below.
const tracing = initTracing('notification-service');

async function main() {
  const { installGracefulShutdown } = await import('@interviewhub/shared');
  const { buildApp } = await import('./app');
  const { config } = await import('./config');
  const { prisma } = await import('./db');
  const { logger } = await import('./logger');

  const server = buildApp().listen(config.port, () => {
    logger.info({ port: config.port }, 'notification-service listening');
  });
  installGracefulShutdown({
    server,
    logger,
    cleanup: async () => {
      await prisma.$disconnect();
      await tracing.shutdown();
    },
  });
}

main().catch((err) => {
  console.error('notification-service failed to start:', err);
  process.exit(1);
});

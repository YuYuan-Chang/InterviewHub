import { initTracing } from '@interviewhub/shared';

// Tracing first: auto-instrumentations must register before express/undici load,
// which is why the app is pulled in via dynamic import below.
const tracing = initTracing('user-service');

async function main() {
  const { installGracefulShutdown } = await import('@interviewhub/shared');
  const { buildApp } = await import('./app');
  const { config } = await import('./config');
  const { prisma } = await import('./db');
  const { logger } = await import('./logger');
  const { notifications } = await import('./events');

  const server = buildApp().listen(config.port, () => {
    logger.info({ port: config.port }, 'user-service listening');
  });
  installGracefulShutdown({
    server,
    logger,
    cleanup: async () => {
      await notifications.disconnect();
      await prisma.$disconnect();
      await tracing.shutdown();
    },
  });
}

main().catch((err) => {
  console.error('user-service failed to start:', err);
  process.exit(1);
});

import { initTracing } from '@interviewhub/shared';

// Tracing first: auto-instrumentations must register before express/undici load,
// which is why the app is pulled in via dynamic import below.
const tracing = initTracing('post-service');

async function main() {
  const { installGracefulShutdown, startJob, pruneRateLimits } = await import('@interviewhub/shared');
  const { buildApp } = await import('./app');
  const { config } = await import('./config');
  const { prisma } = await import('./db');
  const { logger } = await import('./logger');

  const stopRatePrune = startJob('rate-limit-prune', () => pruneRateLimits(prisma), logger);
  const { startMaintenance } = await import('./maintenance');
  const stopMaintenance = startMaintenance();
  const server = buildApp().listen(config.port, () => {
    logger.info({ port: config.port }, 'post-service listening');
  });
  installGracefulShutdown({
    server,
    logger,
    cleanup: async () => {
      await stopMaintenance();
      await stopRatePrune();
      await prisma.$disconnect();
      await tracing.shutdown();
    },
  });
}

main().catch((err) => {
  console.error('post-service failed to start:', err);
  process.exit(1);
});

import { initTracing } from '@interviewhub/shared';

// Tracing first: auto-instrumentations must register before express/undici/aws-sdk
// load, which is why everything else is pulled in via dynamic import below.
const tracing = initTracing('file-service');

async function main() {
  const { installGracefulShutdown } = await import('@interviewhub/shared');
  const { buildApp } = await import('./app');
  const { config } = await import('./config');
  const { prisma } = await import('./db');
  const { logger } = await import('./logger');
  const { ensureBucket } = await import('./storage');

  await ensureBucket();
  const server = buildApp().listen(config.port, () => {
    logger.info({ port: config.port }, 'file-service listening');
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
  console.error('file-service failed to start:', err);
  process.exit(1);
});

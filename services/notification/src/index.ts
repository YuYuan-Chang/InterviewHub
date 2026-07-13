import { initTracing } from '@interviewhub/shared';

// Tracing first: auto-instrumentations must register before express/kafkajs load,
// which is why the app is pulled in via dynamic import below.
const tracing = initTracing('notification-service');

async function main() {
  const { installGracefulShutdown, runNotificationConsumer } = await import('@interviewhub/shared');
  const { buildApp } = await import('./app');
  const { config } = await import('./config');
  const { prisma } = await import('./db');
  const { logger } = await import('./logger');
  const { deliver } = await import('./deliver');

  const server = buildApp().listen(config.port, () => {
    logger.info({ port: config.port }, 'notification-service listening');
  });

  // The consumer is the only ingress for notification events. Keep retrying if
  // the broker isn't up yet — the HTTP API (reads) works regardless.
  let consumer: { disconnect(): Promise<void> } | null = null;
  let stopped = false;
  void (async () => {
    while (!stopped) {
      try {
        consumer = await runNotificationConsumer({
          brokers: config.kafkaBrokers,
          groupId: 'notification-service',
          logger,
          handle: deliver,
        });
        return;
      } catch (err) {
        logger.warn({ err }, 'kafka consumer failed to start, retrying in 5s');
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  })();

  installGracefulShutdown({
    server,
    logger,
    cleanup: async () => {
      stopped = true;
      await consumer?.disconnect();
      await prisma.$disconnect();
      await tracing.shutdown();
    },
  });
}

main().catch((err) => {
  console.error('notification-service failed to start:', err);
  process.exit(1);
});

import type { Server } from 'node:http';
import type { Logger } from './logging';

/**
 * Graceful shutdown: on SIGTERM/SIGINT stop accepting connections, drain
 * in-flight requests, run cleanup (DB disconnect, tracer flush), then exit.
 * A deadline guarantees the process never hangs a rolling deploy.
 */
export function installGracefulShutdown(opts: {
  server: Server;
  logger: Logger;
  cleanup?: () => Promise<unknown>;
  timeoutMs?: number;
}): void {
  const { server, logger, cleanup, timeoutMs = 10_000 } = opts;
  let shuttingDown = false;

  function shutdown(signal: string): void {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'shutdown: draining in-flight requests');

    const deadline = setTimeout(() => {
      logger.error({ timeoutMs }, 'shutdown: deadline exceeded, forcing exit');
      process.exit(1);
    }, timeoutMs);
    deadline.unref();

    server.close((err) => {
      void (async () => {
        if (err) logger.error({ err }, 'shutdown: error closing http server');
        else logger.info('shutdown: http server closed');
        try {
          await cleanup?.();
          logger.info('shutdown: cleanup complete');
        } catch (cleanupErr) {
          logger.error({ err: cleanupErr }, 'shutdown: cleanup failed');
        }
        process.exit(err ? 1 : 0);
      })();
    });
    // stop keep-alive sockets from holding the drain open
    server.closeIdleConnections?.();
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

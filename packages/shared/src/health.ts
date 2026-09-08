import type { Express } from 'express';

/**
 * /livez  — liveness: the process is up.
 * /healthz — readiness: dependencies (DB, object store) are reachable.
 */
export function healthRoutes(app: Express, checkReady?: () => Promise<void>): void {
  app.get('/livez', (_req, res) => {
    res.json({ status: 'ok' });
  });
  app.get('/healthz', async (_req, res) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      if (checkReady) await Promise.race([checkReady(), new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('Readiness deadline exceeded')), 2500);
      })]);
      res.json({ status: 'ready' });
    } catch (err) {
      res.status(503).json({ status: 'not ready' });
    } finally {
      clearTimeout(timer);
    }
  });
}

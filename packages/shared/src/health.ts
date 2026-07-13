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
    try {
      if (checkReady) await checkReady();
      res.json({ status: 'ready' });
    } catch (err) {
      res.status(503).json({ status: 'not ready', error: String(err) });
    }
  });
}

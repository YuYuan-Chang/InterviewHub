import client from 'prom-client';
import type { Express } from 'express';

const SKIP_PATHS = new Set(['/healthz', '/livez', '/metrics']);

/**
 * Prometheus instrumentation: default process metrics plus a request-duration
 * histogram labeled by matched route (not raw URL — bounded label cardinality).
 * Exposes GET /metrics for scraping.
 */
export function installMetrics(app: Express, serviceName: string): void {
  const registry = new client.Registry();
  registry.setDefaultLabels({ service: serviceName });
  client.collectDefaultMetrics({ register: registry });

  const httpDuration = new client.Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
    registers: [registry],
  });

  app.use((req, res, next) => {
    if (SKIP_PATHS.has(req.path)) return next();
    const stop = httpDuration.startTimer({ method: req.method });
    res.on('finish', () => {
      // req.route is set once a handler matched; baseUrl covers mounted routers
      const route = req.route ? `${req.baseUrl}${(req.route as { path: string }).path}` : 'unmatched';
      stop({ route, status_code: String(res.statusCode) });
    });
    next();
  });

  app.get('/metrics', async (_req, res) => {
    res.setHeader('content-type', registry.contentType);
    res.end(await registry.metrics());
  });
}

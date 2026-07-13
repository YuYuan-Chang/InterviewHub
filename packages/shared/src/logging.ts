import pino from 'pino';
import { pinoHttp } from 'pino-http';
import type { RequestHandler } from 'express';
import { getRequestId } from './context';

export type Logger = pino.Logger;

/** Structured JSON logger; every line carries service + requestId automatically. */
export function createLogger(serviceName: string): Logger {
  return pino({
    level: process.env.LOG_LEVEL ?? 'info',
    base: { service: serviceName },
    mixin: () => ({ requestId: getRequestId() }),
    timestamp: pino.stdTimeFunctions.isoTime,
  });
}

const QUIET_PATHS = new Set(['/healthz', '/livez', '/metrics']);

/** Access logging; probe/scrape endpoints are demoted to debug to keep logs readable. */
export function requestLogging(logger: Logger): RequestHandler {
  return pinoHttp({
    logger,
    customLogLevel: (req, res, err) => {
      if (QUIET_PATHS.has(req.url ?? '')) return 'debug';
      if (err || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
    // requestId comes from the logger mixin; keep req/res serialization lean
    serializers: {
      req: (req: { method?: string; url?: string }) => ({ method: req.method, url: req.url }),
      res: (res: { statusCode?: number }) => ({ statusCode: res.statusCode }),
    },
  }) as unknown as RequestHandler;
}

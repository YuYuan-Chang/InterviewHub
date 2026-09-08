import { createHash } from 'node:crypto';
import type { RequestHandler } from 'express';
import { HttpError } from './errors';

export interface RateStore {
  $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  $executeRaw(query: TemplateStringsArray, ...values: unknown[]): Promise<number>;
}

/** Atomic shared buckets in the owning service's DB; no per-replica bypass. */
export function rateLimit(store: RateStore, scope: string, limit: number, windowMs: number,
  identity: (req: Parameters<RequestHandler>[0]) => string = (req) => req.ip ?? 'unknown',
): RequestHandler {
  if (!Number.isSafeInteger(limit) || limit < 1 || !Number.isSafeInteger(windowMs) || windowMs < 1) {
    throw new Error('Rate limits require positive integer limits and windows');
  }
  return async (req, res, next) => {
    try {
      const key = createHash('sha256').update(`${scope}:${identity(req)}`).digest('hex');
      const [bucket] = await store.$queryRaw<{ hits: number; retry: number }[]>`
        INSERT INTO rate_limits (key, hits, expires_at)
        VALUES (${key}, 1, clock_timestamp() + ${windowMs} * interval '1 millisecond')
        ON CONFLICT (key) DO UPDATE SET
          hits = CASE WHEN rate_limits.expires_at <= clock_timestamp() THEN 1 ELSE rate_limits.hits + 1 END,
          expires_at = CASE WHEN rate_limits.expires_at <= clock_timestamp()
            THEN clock_timestamp() + ${windowMs} * interval '1 millisecond' ELSE rate_limits.expires_at END
        RETURNING hits, GREATEST(1, CEIL(EXTRACT(EPOCH FROM (expires_at - clock_timestamp()))))::int AS retry`;
      res.setHeader('RateLimit-Limit', limit);
      res.setHeader('RateLimit-Remaining', Math.max(0, limit - bucket.hits));
      if (bucket.hits > limit) {
        res.setHeader('Retry-After', bucket.retry);
        throw new HttpError(429, 'Too many requests; try again later');
      }
      next();
    } catch (err) {
      next(err instanceof HttpError ? err : new HttpError(503, 'Rate limit store unavailable'));
    }
  };
}

export async function pruneRateLimits(store: RateStore) {
  return store.$executeRaw`DELETE FROM rate_limits WHERE key IN
    (SELECT key FROM rate_limits WHERE expires_at < clock_timestamp() LIMIT 10000)`;
}

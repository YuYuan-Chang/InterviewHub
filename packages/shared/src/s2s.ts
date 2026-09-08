import { HttpError } from './errors';
import { INTERNAL_TOKEN_HEADER } from './auth';
import { getRequestId } from './context';
import type { Logger } from './logging';

export interface S2SClient {
  get<T = unknown>(path: string): Promise<T>;
  post<T = unknown>(path: string, body?: unknown): Promise<T>;
  delete<T = unknown>(path: string): Promise<T>;
}

/** One total deadline, including body reads and retry delays. Mutations never retry. */
export function s2sClient(baseUrl: string, internalToken: string, options: {
  timeoutMs?: number; retries?: number; failureThreshold?: number; resetMs?: number;
} = {}): S2SClient {
  const { timeoutMs = 3000, retries = 2, failureThreshold = 5, resetMs = 10_000 } = options;
  let failures = 0;
  let openedAt: number | undefined;
  let probing = false;
  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const probe = openedAt !== undefined;
    if (probe && (Date.now() - openedAt! < resetMs || probing)) {
      throw new HttpError(502, 'Upstream circuit is open');
    }
    if (probe) probing = true;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const maxRetries = method === 'GET' && !probe ? retries : 0;
    try {
      for (let attempt = 0; ; attempt++) {
        try {
          const requestId = getRequestId();
          const res = await fetch(`${baseUrl}${path}`, {
            method, signal: controller.signal,
            headers: {
              [INTERNAL_TOKEN_HEADER]: internalToken,
              ...(requestId ? { 'x-request-id': requestId } : {}),
              ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
            },
            body: body !== undefined ? JSON.stringify(body) : undefined,
          });
          const text = await res.text();
          if (res.status === 404 || res.status === 409) {
            failures = 0; openedAt = undefined;
            throw new HttpError(res.status, res.status === 404 ? 'Resource not found' : 'Conflict');
          }
          if (!res.ok) {
            const error = new HttpError(502, `Upstream service error (${res.status})`);
            if (![408, 429, 502, 503, 504].includes(res.status)) throw { terminal: error };
            throw error;
          }
          const result = res.status === 204 ? undefined : JSON.parse(text);
          failures = 0; openedAt = undefined;
          return result as T;
        } catch (err) {
          if (err instanceof HttpError && [404, 409].includes(err.status)) throw err;
          if (err && typeof err === 'object' && 'terminal' in err) throw err.terminal;
          if (controller.signal.aborted || attempt >= maxRetries) throw err;
          await new Promise<void>((resolve) => {
            const done = () => { clearTimeout(delay); controller.signal.removeEventListener('abort', done); resolve(); };
            const delay = setTimeout(done, 50 * 2 ** attempt + Math.random() * 50);
            controller.signal.addEventListener('abort', done, { once: true });
          });
          if (controller.signal.aborted) throw err;
        }
      }
    } catch (err) {
      if (err instanceof HttpError && [404, 409].includes(err.status)) throw err;
      if (++failures >= failureThreshold || probe) openedAt = Date.now();
      throw new HttpError(502, controller.signal.aborted ? 'Upstream deadline exceeded' : 'Upstream service unavailable');
    } finally {
      clearTimeout(timer);
      if (probe) probing = false;
    }
  }
  return {
    get: (path) => call('GET', path),
    post: (path, body) => call('POST', path, body ?? {}),
    delete: (path) => call('DELETE', path),
  };
}

export function fireAndForget(promise: Promise<unknown>, label: string, logger?: Logger): void {
  promise.catch((err) => {
    if (logger) logger.warn({ err, label }, 'fire-and-forget side effect failed');
    else console.error(`[fire-and-forget] ${label} failed:`, err?.message ?? err);
  });
}

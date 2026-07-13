import { HttpError } from './errors';
import { INTERNAL_TOKEN_HEADER } from './auth';
import { getRequestId } from './context';
import type { Logger } from './logging';

export interface S2SClient {
  get<T = unknown>(path: string): Promise<T>;
  post<T = unknown>(path: string, body?: unknown): Promise<T>;
  delete<T = unknown>(path: string): Promise<T>;
}

/**
 * Minimal REST client for service-to-service calls. Non-2xx responses become
 * HttpError(404) for missing resources and HttpError(502) otherwise so callers
 * never leak a downstream 500 as their own.
 */
export function s2sClient(baseUrl: string, internalToken: string): S2SClient {
  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
      const requestId = getRequestId();
      res = await fetch(`${baseUrl}${path}`, {
        method,
        headers: {
          [INTERNAL_TOKEN_HEADER]: internalToken,
          // correlation id travels with every S2S hop
          ...(requestId ? { 'x-request-id': requestId } : {}),
          ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      throw new HttpError(502, `Upstream service unreachable: ${baseUrl}`, String(err));
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      if (res.status === 404) throw new HttpError(404, 'Resource not found');
      if (res.status === 409) throw new HttpError(409, safeMessage(text) ?? 'Conflict');
      throw new HttpError(502, `Upstream service error (${res.status})`, text.slice(0, 500));
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }
  return {
    get: (path) => call('GET', path),
    post: (path, body) => call('POST', path, body ?? {}),
    delete: (path) => call('DELETE', path),
  };
}

function safeMessage(text: string): string | undefined {
  try {
    const parsed = JSON.parse(text) as { error?: string };
    return parsed.error;
  } catch {
    return undefined;
  }
}

/** For notifications etc.: never let a side-effect failure break the main request. */
export function fireAndForget(promise: Promise<unknown>, label: string, logger?: Logger): void {
  promise.catch((err) => {
    if (logger) logger.warn({ err, label }, 'fire-and-forget side effect failed');
    else console.error(`[fire-and-forget] ${label} failed:`, err?.message ?? err);
  });
}

import { AsyncLocalStorage } from 'node:async_hooks';
import crypto from 'node:crypto';
import type { RequestHandler } from 'express';

interface RequestStore {
  requestId: string;
}

// AsyncLocalStorage lets the logger and s2sClient read the current request id
// ambiently — no signature changes anywhere in the call chain.
const store = new AsyncLocalStorage<RequestStore>();

export function getRequestId(): string | undefined {
  return store.getStore()?.requestId;
}

/**
 * Adopts the inbound x-request-id (ingress-nginx generates one) or mints a
 * UUID, echoes it on the response, and binds it to this request's async scope.
 */
export function requestContext(): RequestHandler {
  return (req, res, next) => {
    const incoming = req.headers['x-request-id'];
    const requestId = (Array.isArray(incoming) ? incoming[0] : incoming) || crypto.randomUUID();
    res.setHeader('x-request-id', requestId);
    store.run({ requestId }, next);
  };
}

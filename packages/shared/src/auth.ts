import jwt from 'jsonwebtoken';
import type { RequestHandler } from 'express';
import { HttpError } from './errors';

export interface AuthUser {
  id: string;
  email: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

function verifyBearer(header: string | undefined, publicKey: string): AuthUser | null {
  if (!header || !header.startsWith('Bearer ')) return null;
  const payload = jwt.verify(header.slice(7), publicKey, { algorithms: ['RS256'] }) as jwt.JwtPayload;
  if (!payload.sub) return null;
  return { id: payload.sub, email: (payload.email as string) ?? '' };
}

/** Rejects the request unless a valid RS256 access token is presented. */
export function requireAuth(publicKey: string): RequestHandler {
  return (req, _res, next) => {
    let user: AuthUser | null;
    try {
      user = verifyBearer(req.headers.authorization, publicKey);
    } catch {
      return next(new HttpError(401, 'Invalid or expired token'));
    }
    if (!user) return next(new HttpError(401, 'Missing bearer token'));
    req.user = user;
    next();
  };
}

/** Attaches req.user when a valid token is present, but lets anonymous requests through. */
export function optionalAuth(publicKey: string): RequestHandler {
  return (req, _res, next) => {
    try {
      req.user = verifyBearer(req.headers.authorization, publicKey) ?? undefined;
    } catch {
      req.user = undefined;
    }
    next();
  };
}

export const INTERNAL_TOKEN_HEADER = 'x-internal-token';

/** Guards service-to-service endpoints with a shared secret header. */
export function requireInternal(internalToken: string): RequestHandler {
  return (req, _res, next) => {
    if (req.headers[INTERNAL_TOKEN_HEADER] !== internalToken) {
      return next(new HttpError(401, 'Invalid internal token'));
    }
    next();
  };
}

/** Convenience for handlers behind requireAuth. */
export function authedUser(req: { user?: AuthUser }): AuthUser {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  return req.user;
}

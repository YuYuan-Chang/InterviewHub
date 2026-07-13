import type { RequestHandler, Request } from 'express';
import { ZodError, z, type ZodTypeAny } from 'zod';
import { HttpError } from './errors';

function toHttpError(err: unknown): never {
  if (err instanceof ZodError) {
    throw new HttpError(400, 'Validation failed', err.issues.map((i) => `${i.path.join('.')}: ${i.message}`));
  }
  throw err;
}

/** Middleware: parses and replaces req.body. */
export function validateBody<S extends ZodTypeAny>(schema: S): RequestHandler {
  return (req, _res, next) => {
    try {
      req.body = schema.parse(req.body ?? {});
      next();
    } catch (err) {
      try {
        toHttpError(err);
      } catch (e) {
        next(e);
      }
    }
  };
}

/** In-handler helpers (Express 5 makes req.query read-only, so we parse on demand). */
export function parseQuery<S extends ZodTypeAny>(schema: S, query: unknown): z.output<S> {
  try {
    return schema.parse(query ?? {});
  } catch (err) {
    toHttpError(err);
  }
}

/**
 * Express 5 types path params as string | string[] (repeatable segments).
 * Our routes never use repeatable params, so coerce to a single string.
 */
export function param(req: Request, name: string): string {
  const value = (req.params as Record<string, string | string[]>)[name];
  const single = Array.isArray(value) ? value[0] : value;
  if (!single) throw new HttpError(400, `Missing path parameter: ${name}`);
  return single;
}

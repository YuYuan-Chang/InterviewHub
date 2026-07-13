import type { ErrorRequestHandler, RequestHandler } from 'express';
import type { Logger } from './logging';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ error: 'Not found' });
};

export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (err, req, res, _next) => {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message, details: err.details });
      return;
    }
    // multer file-size limit
    if (err && typeof err === 'object' && (err as { code?: string }).code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({ error: 'File exceeds the 10MB limit' });
      return;
    }
    logger.error({ err, method: req.method, url: req.originalUrl }, 'unhandled error');
    res.status(500).json({ error: 'Internal server error' });
  };
}

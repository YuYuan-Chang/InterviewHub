import express from 'express';
import {
  errorHandler,
  healthRoutes,
  installMetrics,
  notFoundHandler,
  requestContext,
  requestLogging,
} from '@interviewhub/shared';
import { logger } from './logger';
import { prisma } from './db';
import { router } from './routes';

export function buildApp(): express.Express {
  const app = express();
  app.use(requestContext());
  app.use(requestLogging(logger));
  installMetrics(app, 'notification-service');
  app.use(express.json({ limit: '100kb' }));
  healthRoutes(app, async () => {
    await prisma.$queryRaw`SELECT 1`;
  });
  app.use(router);
  app.use(notFoundHandler);
  app.use(errorHandler(logger));
  return app;
}

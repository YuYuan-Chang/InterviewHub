import express from 'express';
import {
  rateLimit,
  errorHandler,
  healthRoutes,
  installMetrics,
  notFoundHandler,
  requestContext,
  requestLogging,
} from '@interviewhub/shared';
import { config } from './config';
import { logger } from './logger';
import { prisma } from './db';
import { router } from './routes';

export function buildApp(): express.Express {
  const app = express();
  app.set('trust proxy', config.trustProxy ? config.trustProxy.split(',') : false);
  app.use(requestContext());
  app.use(requestLogging(logger));
  installMetrics(app, 'auth-service');
  app.use('/api', rateLimit(prisma, 'api', config.apiRateLimit, 60_000));
  app.use(express.json({ limit: '100kb' }));
  healthRoutes(app, async () => {
    await prisma.$queryRaw`SELECT 1`;
  });
  app.use(router);
  app.use(notFoundHandler);
  app.use(errorHandler(logger));
  return app;
}

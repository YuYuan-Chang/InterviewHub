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
import { profilesRouter } from './profiles';
import { followsRouter } from './follows/routes';
import { internalRouter } from './internal';

export function buildApp(): express.Express {
  const app = express();
  app.use(requestContext());
  app.use(requestLogging(logger));
  installMetrics(app, 'user-service');
  app.use(express.json({ limit: '100kb' }));
  healthRoutes(app, async () => {
    await prisma.$queryRaw`SELECT 1`;
  });
  app.use(profilesRouter);
  app.use(followsRouter);
  app.use(internalRouter);
  app.use(notFoundHandler);
  app.use(errorHandler(logger));
  return app;
}

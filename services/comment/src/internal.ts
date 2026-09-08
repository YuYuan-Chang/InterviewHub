import { Router } from 'express';
import { requireInternal, param } from '@interviewhub/shared';
import { z } from 'zod';
import { prisma } from './db';
import { config } from './config';

export const internalRouter: Router = Router();
internalRouter.use('/internal', requireInternal(config.internalToken));
internalRouter.get('/internal/comments/post/:id/count', async (req, res) => {
  const postId = z.string().uuid().parse(param(req, 'id'));
  res.json({ count: await prisma.comment.count({ where: { postId } }) });
});

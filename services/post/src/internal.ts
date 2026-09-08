import { Router } from 'express';
import { z } from 'zod';
import { HttpError, requireInternal, validateBody, param } from '@interviewhub/shared';
import { prisma } from './db';
import { config } from './config';
import { syncCommentCount } from './maintenance';

const deltaSchema = z.object({ delta: z.union([z.literal(1), z.literal(-1)]) });

export const internalRouter: Router = Router();
internalRouter.use('/internal', requireInternal(config.internalToken));

// comment-service asks who wrote a post (to notify) and that it exists
internalRouter.get('/internal/posts/:id', async (req, res) => {
  const post = await prisma.post.findUnique({
    where: { id: param(req, 'id') },
    select: { id: true, authorId: true, title: true },
  });
  if (!post) throw new HttpError(404, 'Post not found');
  res.json(post);
});

// comment-service keeps the denormalized comment counter in sync
internalRouter.post('/internal/posts/:id/comment-count', validateBody(deltaSchema), async (req, res) => {
  await syncCommentCount(param(req, 'id'));
  res.status(204).end();
});

internalRouter.get('/internal/file-references/:id', async (req, res) => {
  const id = z.string().uuid().parse(param(req, 'id'));
  const post = await prisma.post.findFirst({ where: { OR: [
    { fileId: id }, { attachments: { array_contains: [{ fileId: id }] } },
  ] }, select: { id: true } });
  res.json({ referenced: !!post });
});

import { Router } from 'express';
import { z } from 'zod';
import {
  authedUser,
  clampLimit,
  decodeCursor,
  encodeCursor,
  parseQuery,
  requireAuth,
  requireInternal,
  s2sClient,
  validateBody,
  param,
} from '@interviewhub/shared';
import { prisma } from './db';
import { config } from './config';

const userService = s2sClient(config.userServiceUrl, config.internalToken);

const createSchema = z.object({
  recipientId: z.string().uuid(),
  type: z.enum(['new_follower', 'new_comment', 'new_reply']),
  actorId: z.string().uuid(),
  postId: z.string().uuid().optional(),
  commentId: z.string().uuid().optional(),
});

const listQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().optional(),
  unreadOnly: z.coerce.boolean().optional().default(false),
});

interface ActorSummary {
  userId: string;
  username: string;
  displayName: string;
}

export const router: Router = Router();

router.post('/internal/notifications', requireInternal(config.internalToken), validateBody(createSchema), async (req, res) => {
  // Users never get notified about their own actions.
  if (req.body.recipientId === req.body.actorId) {
    res.status(204).end();
    return;
  }
  const notification = await prisma.notification.create({ data: req.body });
  res.status(201).json(notification);
});

router.get('/api/notifications', requireAuth(config.jwtPublicKey), async (req, res) => {
  const user = authedUser(req);
  const q = parseQuery(listQuery, req.query);
  const limit = clampLimit(q.limit, 20, 100);
  const cursor = decodeCursor<{ before: string }>(q.cursor);

  const [items, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: {
        recipientId: user.id,
        ...(q.unreadOnly ? { read: false } : {}),
        ...(cursor ? { createdAt: { lt: new Date(cursor.before) } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
    }),
    prisma.notification.count({ where: { recipientId: user.id, read: false } }),
  ]);

  const page = items.slice(0, limit);
  const actorIds = [...new Set(page.map((n) => n.actorId))];
  const profilesRes = actorIds.length
    ? await userService
        .post<{ profiles: ActorSummary[] }>('/internal/profiles/batch', { ids: actorIds })
        .catch(() => ({ profiles: [] as ActorSummary[] }))
    : { profiles: [] as ActorSummary[] };
  const actorsById = new Map(profilesRes.profiles.map((p) => [p.userId, p]));

  res.json({
    items: page.map((n) => ({ ...n, actor: actorsById.get(n.actorId) ?? null })),
    unreadCount,
    nextCursor:
      items.length > limit && page.length > 0
        ? encodeCursor({ before: page[page.length - 1].createdAt.toISOString() })
        : null,
  });
});

router.post('/api/notifications/:id/read', requireAuth(config.jwtPublicKey), async (req, res) => {
  const user = authedUser(req);
  await prisma.notification.updateMany({
    where: { id: param(req, 'id'), recipientId: user.id },
    data: { read: true },
  });
  res.status(204).end();
});

router.post('/api/notifications/read-all', requireAuth(config.jwtPublicKey), async (req, res) => {
  const user = authedUser(req);
  await prisma.notification.updateMany({
    where: { recipientId: user.id, read: false },
    data: { read: true },
  });
  res.status(204).end();
});

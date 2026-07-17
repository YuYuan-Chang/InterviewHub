import { Router } from 'express';
import { z } from 'zod';
import {
  HttpError,
  authedUser,
  clampLimit,
  decodeCursor,
  encodeCursor,
  parseQuery,
  requireAuth,
  param,
} from '@interviewhub/shared';
import { prisma } from '../db';
import { config } from '../config';
import * as follows from './service';
import { notifications } from '../events';

const listQuery = z.object({ cursor: z.string().optional(), limit: z.coerce.number().optional() });

export const followsRouter: Router = Router();

followsRouter.post('/api/users/:userId/follow', requireAuth(config.jwtPublicKey), async (req, res) => {
  const viewer = authedUser(req);
  const target = param(req, 'userId');
  if (viewer.id === target) throw new HttpError(400, 'You cannot follow yourself');
  const targetProfile = await prisma.profile.findUnique({ where: { userId: target } });
  if (!targetProfile) throw new HttpError(404, 'User not found');

  const created = await follows.follow(viewer.id, target);
  if (created) {
    // durable via Kafka; fail-open if the broker is down (publish never throws)
    void notifications.publish({
      type: 'new_follower',
      recipientId: target,
      actorId: viewer.id,
    });
  }
  res.status(created ? 201 : 200).json(await follows.followCounts(target));
});

followsRouter.delete('/api/users/:userId/follow', requireAuth(config.jwtPublicKey), async (req, res) => {
  const viewer = authedUser(req);
  await follows.unfollow(viewer.id, param(req, 'userId'));
  res.json(await follows.followCounts(param(req, 'userId')));
});

async function listHandler(direction: 'followers' | 'following', userId: string, rawQuery: unknown) {
  const { cursor, limit: rawLimit } = parseQuery(listQuery, rawQuery);
  const limit = clampLimit(rawLimit);
  const before = decodeCursor<{ before: string }>(cursor);
  const edges = await follows.listEdges(userId, direction, limit + 1, before ? new Date(before.before) : undefined);
  const page = edges.slice(0, limit);
  const ids = page.map((e) => (direction === 'followers' ? e.followerId : e.followeeId));
  const profiles = await prisma.profile.findMany({
    where: { userId: { in: ids } },
    select: { userId: true, username: true, displayName: true, school: true, avatarFileId: true },
  });
  const byId = new Map(profiles.map((p) => [p.userId, p]));
  return {
    items: ids.map((id) => byId.get(id)).filter(Boolean),
    nextCursor:
      edges.length > limit ? encodeCursor({ before: page[page.length - 1].createdAt.toISOString() }) : null,
  };
}

followsRouter.get('/api/users/:userId/followers', async (req, res) => {
  res.json(await listHandler('followers', param(req, 'userId'), req.query));
});

followsRouter.get('/api/users/:userId/following', async (req, res) => {
  res.json(await listHandler('following', param(req, 'userId'), req.query));
});

import { Router } from 'express';
import { z } from 'zod';
import { HttpError, authedUser, optionalAuth, parseQuery, requireAuth, validateBody, param } from '@interviewhub/shared';
import { prisma } from './db';
import { config } from './config';
import { followCounts, isFollowing } from './follows/service';

const updateSchema = z.object({
  displayName: z.string().min(1).max(80).optional(),
  school: z.string().max(120).optional(),
  targetRoles: z.array(z.string().min(1).max(60)).max(10).optional(),
  bio: z.string().max(2000).optional(),
});

async function withCounts(profile: NonNullable<Awaited<ReturnType<typeof prisma.profile.findUnique>>>, viewerId?: string) {
  const counts = await followCounts(profile.userId);
  return {
    ...profile,
    ...counts,
    isFollowing: viewerId ? await isFollowing(viewerId, profile.userId) : false,
  };
}

export const profilesRouter: Router = Router();

profilesRouter.get('/api/users/me', requireAuth(config.jwtPublicKey), async (req, res) => {
  const { id } = authedUser(req);
  const profile = await prisma.profile.findUnique({ where: { userId: id } });
  if (!profile) throw new HttpError(404, 'Profile not found');
  res.json(await withCounts(profile));
});

profilesRouter.patch(
  '/api/users/me',
  requireAuth(config.jwtPublicKey),
  validateBody(updateSchema),
  async (req, res) => {
    const { id } = authedUser(req);
    const profile = await prisma.profile.update({ where: { userId: id }, data: req.body });
    res.json(await withCounts(profile));
  },
);

const searchQuery = z.object({ q: z.string().trim().min(1).max(100) });

profilesRouter.get('/api/users/search', optionalAuth(config.jwtPublicKey), async (req, res) => {
  const { q } = parseQuery(searchQuery, req.query);
  const profiles = await prisma.profile.findMany({
    where: {
      OR: [
        { username: { contains: q, mode: 'insensitive' } },
        { displayName: { contains: q, mode: 'insensitive' } },
        { school: { contains: q, mode: 'insensitive' } },
      ],
    },
    orderBy: { createdAt: 'asc' },
    take: 20,
  });
  const items = await Promise.all(profiles.map((p) => withCounts(p, req.user?.id)));
  res.json({ items });
});

profilesRouter.get('/api/users/by-username/:username', optionalAuth(config.jwtPublicKey), async (req, res) => {
  const profile = await prisma.profile.findUnique({ where: { username: param(req, 'username') } });
  if (!profile) throw new HttpError(404, 'Profile not found');
  res.json(await withCounts(profile, req.user?.id));
});

profilesRouter.get('/api/users/by-id/:userId', optionalAuth(config.jwtPublicKey), async (req, res) => {
  const profile = await prisma.profile.findUnique({ where: { userId: param(req, 'userId') } });
  if (!profile) throw new HttpError(404, 'Profile not found');
  res.json(await withCounts(profile, req.user?.id));
});

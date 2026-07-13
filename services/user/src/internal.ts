import { Router } from 'express';
import { z } from 'zod';
import { HttpError, requireInternal, validateBody, param } from '@interviewhub/shared';
import { Prisma } from '../generated/prisma';
import { prisma } from './db';
import { config } from './config';
import { followingIds } from './follows/service';

const createProfileSchema = z.object({
  userId: z.string().uuid(),
  username: z.string().min(3).max(30),
  displayName: z.string().min(1).max(80),
  school: z.string().max(120).optional().default(''),
  targetRoles: z.array(z.string()).max(10).optional().default([]),
});

const batchSchema = z.object({ ids: z.array(z.string().uuid()).max(200) });

export const internalRouter: Router = Router();
internalRouter.use('/internal', requireInternal(config.internalToken));

internalRouter.post('/internal/profiles', validateBody(createProfileSchema), async (req, res) => {
  try {
    const profile = await prisma.profile.create({ data: req.body });
    res.status(201).json(profile);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new HttpError(409, 'Username or user already exists');
    }
    throw err;
  }
});

internalRouter.get('/internal/users/:userId/following', async (req, res) => {
  res.json({ ids: await followingIds(param(req, 'userId')) });
});

internalRouter.post('/internal/profiles/batch', validateBody(batchSchema), async (req, res) => {
  const profiles = await prisma.profile.findMany({
    where: { userId: { in: req.body.ids } },
    select: { userId: true, username: true, displayName: true, school: true },
  });
  res.json({ profiles });
});

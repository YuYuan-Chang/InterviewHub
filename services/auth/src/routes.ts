import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import {
  HttpError,
  fireAndForget,
  requireAuth,
  authedUser,
  s2sClient,
  validateBody,
  param,
} from '@interviewhub/shared';
import { Prisma } from '../generated/prisma';
import { logger } from './logger';
import { prisma } from './db';
import { config } from './config';
import { hashRefreshToken, issueTokenPair, signAccessToken } from './tokens';

const userService = s2sClient(config.userServiceUrl, config.internalToken);

const registerSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(128),
  username: z
    .string()
    .min(3)
    .max(30)
    .regex(/^[a-zA-Z0-9_]+$/, 'letters, numbers and underscores only'),
  displayName: z.string().min(1).max(80),
  school: z.string().max(120).optional().default(''),
  targetRoles: z.array(z.string().min(1).max(60)).max(10).optional().default([]),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const refreshSchema = z.object({ refreshToken: z.string().min(1) });

export const router: Router = Router();

router.post('/api/auth/register', validateBody(registerSchema), async (req, res) => {
  const { email, password, username, displayName, school, targetRoles } = req.body;

  const passwordHash = await bcrypt.hash(password, 10);
  let user;
  try {
    user = await prisma.user.create({ data: { email: email.toLowerCase(), passwordHash } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new HttpError(409, 'An account with this email already exists');
    }
    throw err;
  }

  // Saga-lite: create the profile in user-service; if that fails (e.g. username
  // taken), roll back the credential row so registration stays atomic-ish.
  try {
    await userService.post('/internal/profiles', {
      userId: user.id,
      username,
      displayName,
      school,
      targetRoles,
    });
  } catch (err) {
    await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
    if (err instanceof HttpError && err.status === 409) {
      throw new HttpError(409, 'This username is already taken');
    }
    throw err;
  }

  res.status(201).json(await issueTokenPair(user.id, user.email));
});

router.post('/api/auth/login', validateBody(loginSchema), async (req, res) => {
  const { email, password } = req.body;
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new HttpError(401, 'Invalid email or password');
  }
  res.json(await issueTokenPair(user.id, user.email));
});

router.post('/api/auth/refresh', validateBody(refreshSchema), async (req, res) => {
  const tokenHash = hashRefreshToken(req.body.refreshToken);
  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash }, include: { user: true } });
  if (!stored || stored.expiresAt < new Date()) {
    throw new HttpError(401, 'Invalid or expired refresh token');
  }
  // Rotate: the old refresh token is single-use.
  await prisma.refreshToken.delete({ where: { id: stored.id } });
  fireAndForget(
    prisma.refreshToken.deleteMany({ where: { userId: stored.userId, expiresAt: { lt: new Date() } } }),
    'prune expired refresh tokens',
    logger,
  );
  res.json(await issueTokenPair(stored.user.id, stored.user.email));
});

router.post('/api/auth/logout', validateBody(refreshSchema), async (req, res) => {
  await prisma.refreshToken.deleteMany({ where: { tokenHash: hashRefreshToken(req.body.refreshToken) } });
  res.status(204).end();
});

router.get('/api/auth/me', requireAuth(config.jwtPublicKey), (req, res) => {
  res.json(authedUser(req));
});

// Re-issue an access token from a still-valid one (used by tests/tools).
router.post('/api/auth/token', requireAuth(config.jwtPublicKey), (req, res) => {
  const user = authedUser(req);
  res.json({ accessToken: signAccessToken(user.id, user.email) });
});

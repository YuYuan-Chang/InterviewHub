import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from './config';
import { prisma } from './db';

export function signAccessToken(userId: string, email: string): string {
  return jwt.sign({ email }, config.jwtPrivateKey, {
    algorithm: 'RS256',
    subject: userId,
    expiresIn: config.accessTokenTtl as jwt.SignOptions['expiresIn'],
  });
}

export function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function issueRefreshToken(userId: string): Promise<string> {
  const token = crypto.randomBytes(48).toString('hex');
  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hashRefreshToken(token),
      expiresAt: new Date(Date.now() + config.refreshTokenTtlDays * 24 * 3600 * 1000),
    },
  });
  return token;
}

export async function issueTokenPair(userId: string, email: string) {
  return {
    accessToken: signAccessToken(userId, email),
    refreshToken: await issueRefreshToken(userId),
    user: { id: userId, email },
  };
}

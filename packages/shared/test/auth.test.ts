import { describe, expect, it } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { errorHandler, optionalAuth, requireAuth, requireInternal } from '../src';

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

function appWith(middleware: express.RequestHandler) {
  const app = express();
  app.get('/x', middleware, (req, res) => res.json({ user: req.user ?? null }));
  app.use(errorHandler('test'));
  return app;
}

function token(sub: string, key = privateKey, expiresIn = '1h') {
  return jwt.sign({ email: 'a@b.c' }, key, { algorithm: 'RS256', subject: sub, expiresIn: expiresIn as never });
}

describe('requireAuth', () => {
  it('rejects missing tokens', async () => {
    const res = await request(appWith(requireAuth(publicKey))).get('/x');
    expect(res.status).toBe(401);
  });

  it('rejects garbage tokens', async () => {
    const res = await request(appWith(requireAuth(publicKey))).get('/x').set('authorization', 'Bearer nope');
    expect(res.status).toBe(401);
  });

  it('rejects tokens signed by a different key', async () => {
    const other = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    const res = await request(appWith(requireAuth(publicKey)))
      .get('/x')
      .set('authorization', `Bearer ${token('u1', other.privateKey)}`);
    expect(res.status).toBe(401);
  });

  it('rejects expired tokens', async () => {
    const res = await request(appWith(requireAuth(publicKey)))
      .get('/x')
      .set('authorization', `Bearer ${token('u1', privateKey, '-10s')}`);
    expect(res.status).toBe(401);
  });

  it('accepts valid tokens and attaches the user', async () => {
    const res = await request(appWith(requireAuth(publicKey)))
      .get('/x')
      .set('authorization', `Bearer ${token('user-123')}`);
    expect(res.status).toBe(200);
    expect(res.body.user).toEqual({ id: 'user-123', email: 'a@b.c' });
  });
});

describe('optionalAuth', () => {
  it('lets anonymous requests through', async () => {
    const res = await request(appWith(optionalAuth(publicKey))).get('/x');
    expect(res.status).toBe(200);
    expect(res.body.user).toBeNull();
  });

  it('ignores invalid tokens instead of failing', async () => {
    const res = await request(appWith(optionalAuth(publicKey))).get('/x').set('authorization', 'Bearer junk');
    expect(res.status).toBe(200);
    expect(res.body.user).toBeNull();
  });
});

describe('requireInternal', () => {
  it('enforces the shared secret header', async () => {
    const app = appWith(requireInternal('s3cret'));
    expect((await request(app).get('/x')).status).toBe(401);
    expect((await request(app).get('/x').set('x-internal-token', 'wrong')).status).toBe(401);
    expect((await request(app).get('/x').set('x-internal-token', 's3cret')).status).toBe(200);
  });
});

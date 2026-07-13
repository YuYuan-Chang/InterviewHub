import { describe, expect, it, afterAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { AddressInfo } from 'node:net';
import { getRequestId, requestContext, s2sClient } from '../src';

describe('requestContext', () => {
  const app = express();
  app.use(requestContext());
  app.get('/x', (_req, res) => {
    res.json({ requestId: getRequestId() });
  });

  it('adopts an inbound x-request-id and echoes it', async () => {
    const res = await request(app).get('/x').set('x-request-id', 'req-abc-123');
    expect(res.headers['x-request-id']).toBe('req-abc-123');
    expect(res.body.requestId).toBe('req-abc-123');
  });

  it('mints a UUID when no id is inbound', async () => {
    const res = await request(app).get('/x');
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.body.requestId).toBe(res.headers['x-request-id']);
  });

  it('returns undefined outside a request scope', () => {
    expect(getRequestId()).toBeUndefined();
  });
});

describe('s2sClient correlation', () => {
  // downstream service capturing what headers arrive
  const seen: Record<string, string | undefined> = {};
  const downstream = express();
  downstream.get('/internal/x', (req, res) => {
    seen.requestId = req.headers['x-request-id'] as string | undefined;
    seen.token = req.headers['x-internal-token'] as string | undefined;
    res.json({ ok: true });
  });
  const server = downstream.listen(0);
  const downstreamUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  afterAll(() => server.close());

  it('forwards the current request id on S2S hops', async () => {
    const upstream = express();
    upstream.use(requestContext());
    upstream.get('/call', async (_req, res) => {
      const client = s2sClient(downstreamUrl, 's3cret');
      res.json(await client.get('/internal/x'));
    });

    const res = await request(upstream).get('/call').set('x-request-id', 'trace-me-42');
    expect(res.status).toBe(200);
    expect(seen.requestId).toBe('trace-me-42');
    expect(seen.token).toBe('s3cret');
  });
});

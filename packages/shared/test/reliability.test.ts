import { afterEach, describe, expect, it, vi } from 'vitest';
import { s2sClient } from '../src/s2s';
import { drainOutbox, notificationRecord } from '../src/outbox';
import { rateLimit } from '../src/rate-limit';
import { startJob } from '../src/jobs';
import type { Logger } from '../src/logging';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
const event = notificationRecord({ type: 'new_follower', actorId: '4c9f1f9e-7b1a-4d7e-9a44-2f6f4d1a2b3c', recipientId: '4c9f1f9e-7b1a-4d7e-9a44-2f6f4d1a2b3d' });

describe('S2S failure isolation', () => {
  it('retries a transient GET but never repeats a mutation', async () => {
    const fetch = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(new Response('{"ok":true}'));
    vi.stubGlobal('fetch', fetch);
    expect(await s2sClient('http://peer', 'token').get('/x')).toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledTimes(2);
    fetch.mockReset().mockRejectedValue(new Error('offline'));
    await expect(s2sClient('http://peer', 'token').post('/x')).rejects.toMatchObject({ status: 502 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('bounds stalled response bodies with the same deadline', async () => {
    vi.stubGlobal('fetch', vi.fn((_url, init) => Promise.resolve({ ok: true, status: 200,
      text: () => new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted')))),
    })));
    await expect(s2sClient('http://peer', 'token', { timeoutMs: 20 }).get('/x')).rejects.toMatchObject({ status: 502, message: 'Upstream deadline exceeded' });
  });
  it('opens on failures and permits only one recovery probe', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn().mockRejectedValue(new Error('offline'));
    vi.stubGlobal('fetch', fetch);
    const client = s2sClient('http://peer', 'token', { retries: 0, failureThreshold: 1, resetMs: 100 });
    await expect(client.get('/x')).rejects.toMatchObject({ status: 502 });
    await expect(client.get('/x')).rejects.toMatchObject({ message: 'Upstream circuit is open' });
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(101);
    let resolve!: (value: Response) => void;
    fetch.mockImplementation(() => new Promise<Response>((r) => { resolve = r; }));
    const recovering = client.get('/x');
    await expect(client.get('/x')).rejects.toMatchObject({ message: 'Upstream circuit is open' });
    resolve(new Response('{}'));
    await recovering;
    fetch.mockResolvedValue(new Response('{}'));
    await expect(client.get('/x')).resolves.toEqual({});
  });
  it('does not retry or trip the breaker for 404 and 409', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response('{}', { status: 404 })).mockResolvedValueOnce(new Response('{}', { status: 409 }));
    vi.stubGlobal('fetch', fetch);
    const client = s2sClient('http://peer', 'token', { failureThreshold: 1 });
    await expect(client.get('/x')).rejects.toMatchObject({ status: 404 });
    await expect(client.get('/x')).rejects.toMatchObject({ status: 409 });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe('transactional outbox relay', () => {
  it('retains failed events with backoff and acknowledges only confirmed sends', async () => {
    const store = { findMany: vi.fn().mockResolvedValue([{ ...event, attempts: 0 }]), deleteMany: vi.fn(), updateMany: vi.fn() };
    const publish = vi.fn().mockRejectedValueOnce(new Error('broker down')).mockResolvedValue(undefined);
    await expect(drainOutbox(store, publish)).rejects.toThrow('broker down');
    expect(store.deleteMany).not.toHaveBeenCalled();
    expect(store.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { attempts: { increment: 1 }, availableAt: expect.any(Date) } }));
    await drainOutbox(store, publish);
    expect(publish.mock.calls[0][0].eventId).toBe(publish.mock.calls[1][0].eventId);
    expect(store.deleteMany).toHaveBeenCalledWith({ where: { id: event.id } });
  });
  it('replays the same identity after a crash between send and ack', async () => {
    const store = { findMany: vi.fn().mockResolvedValue([{ ...event, attempts: 0 }]), deleteMany: vi.fn().mockRejectedValueOnce(new Error('db down')).mockResolvedValue({ count: 1 }), updateMany: vi.fn() };
    const publish = vi.fn().mockResolvedValue(undefined);
    await expect(drainOutbox(store, publish)).rejects.toThrow();
    await drainOutbox(store, publish);
    expect(publish.mock.calls[0][0]).toEqual(publish.mock.calls[1][0]);
  });
});

describe('rate limits', () => {
  it('rejects exhausted buckets with Retry-After and fails closed if storage fails', async () => {
    const store = { $queryRaw: vi.fn().mockResolvedValue([{ hits: 11, retry: 20 }]), $executeRaw: vi.fn() };
    const next = vi.fn(); const res = { setHeader: vi.fn() };
    const middleware = rateLimit(store, 'login', 10, 1000);
    await middleware({ ip: '127.0.0.1' } as never, res as never, next);
    expect(next).toHaveBeenLastCalledWith(expect.objectContaining({ status: 429 }));
    expect(res.setHeader).toHaveBeenCalledWith('Retry-After', 20);
    store.$queryRaw.mockRejectedValue(new Error('db down'));
    await middleware({ ip: '127.0.0.1' } as never, res as never, next);
    expect(next).toHaveBeenLastCalledWith(expect.objectContaining({ status: 503 }));
  });
});

it('does not overlap jobs and drains on shutdown', async () => {
  vi.useFakeTimers();
  let finish!: () => void;
  const run = vi.fn(() => new Promise<void>((r) => { finish = r; }));
  const logger = { info: vi.fn(), error: vi.fn() } as unknown as Logger;
  const stop = startJob('test', run, logger, 10);
  await vi.advanceTimersByTimeAsync(100);
  expect(run).toHaveBeenCalledTimes(1);
  const stopped = stop(); finish(); await stopped;
  await vi.advanceTimersByTimeAsync(100);
  expect(run).toHaveBeenCalledTimes(1);
});

import { expect, it, vi } from 'vitest';
const tx = vi.hoisted(() => ({ follow: { createMany: vi.fn() }, outbox: { create: vi.fn() } }));
vi.mock('../src/db', () => ({ prisma: { $transaction: (fn: (tx: unknown) => unknown) => fn(tx) } }));
import { follow } from '../src/follows/service';
it('enqueues only new follow edges inside the same transaction', async () => {
  tx.follow.createMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
  expect(await follow('actor', 'recipient')).toBe(true);
  expect(await follow('actor', 'recipient')).toBe(false);
  expect(tx.outbox.create).toHaveBeenCalledTimes(1);
  expect(tx.outbox.create).toHaveBeenCalledWith({ data: expect.objectContaining({ payload: expect.objectContaining({ actorId: 'actor', recipientId: 'recipient', eventId: expect.any(String) }) }) });
});

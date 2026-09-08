import { beforeEach, expect, it, vi } from 'vitest';
const createMany = vi.hoisted(() => vi.fn());
vi.mock('../src/db', () => ({ prisma: { notification: { createMany } } }));
vi.mock('../src/logger', () => ({ logger: { info: vi.fn() } }));
import { deliver } from '../src/deliver';
const event = { type: 'new_follower' as const, eventId: 'stable-event', actorId: 'actor', recipientId: 'recipient' };
beforeEach(() => { createMany.mockReset(); });
it('uses database uniqueness for redelivery without resetting read state', async () => {
  await deliver(event); await deliver(event);
  expect(createMany).toHaveBeenCalledWith({ skipDuplicates: true, data: {
    eventId: event.eventId, type: event.type, actorId: event.actorId, recipientId: event.recipientId, postId: null, commentId: null,
  } });
});
it('propagates persistence failures so offsets remain uncommitted', async () => {
  createMany.mockRejectedValue(new Error('offline'));
  await expect(deliver(event)).rejects.toThrow('offline');
});
it('suppresses self notifications and rejects missing delivery identities', async () => {
  await deliver({ ...event, recipientId: event.actorId });
  expect(createMany).not.toHaveBeenCalled();
  await expect(deliver({ ...event, eventId: undefined })).rejects.toThrow('identity');
});

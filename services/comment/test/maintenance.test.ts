import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ get: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn(), updateMany: vi.fn(), count: vi.fn() }));
vi.mock('../src/config', () => ({ config: { postServiceUrl: 'http://posts' } }));
vi.mock('../src/logger', () => ({ logger: {} }));
vi.mock('@interviewhub/shared', async (original) => ({ ...await original<object>(), s2sClient: () => ({ get: mocks.get }) }));
vi.mock('../src/db', () => ({ prisma: {
  comment: { findMany: mocks.findMany, deleteMany: mocks.deleteMany },
  $transaction: (fn: (tx: unknown) => unknown) => fn({ comment: { updateMany: mocks.updateMany }, commentReaction: { count: mocks.count } }),
} }));
import { HttpError } from '@interviewhub/shared';
import { repairComments } from '../src/maintenance';
beforeEach(() => { vi.clearAllMocks(); mocks.findMany.mockResolvedValue([{ id: 'comment', postId: 'post' }]); mocks.count.mockResolvedValue(2); });
it('only deletes comments for an authoritative missing post', async () => {
  mocks.get.mockRejectedValue(new HttpError(502, 'offline'));
  await expect(repairComments()).rejects.toThrow('offline');
  expect(mocks.deleteMany).not.toHaveBeenCalled();
  mocks.get.mockRejectedValue(new HttpError(404, 'missing'));
  await repairComments();
  expect(mocks.deleteMany).toHaveBeenCalledWith({ where: { postId: 'post' } });
});
it('repairs reaction counts from source rows', async () => {
  mocks.get.mockResolvedValue({ id: 'post' });
  await repairComments();
  expect(mocks.updateMany).toHaveBeenCalledWith({ where: { id: 'comment' }, data: { upvoteCount: 2 } });
});

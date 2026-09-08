import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  refs: vi.fn(), remove: vi.fn(), list: vi.fn(),
  file: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
}));
vi.mock('../src/config', () => ({ config: { postServiceUrl: 'http://post', userServiceUrl: 'http://user', fileGcGraceMs: 86_400_000 } }));
vi.mock('../src/logger', () => ({ logger: {} }));
vi.mock('@interviewhub/shared', async (original) => ({ ...await original<object>(), s2sClient: () => ({ get: mocks.refs }) }));
vi.mock('../src/storage', () => ({ deleteObject: mocks.remove, listObjects: mocks.list }));
vi.mock('../src/db', () => ({ prisma: {
  file: mocks.file,
  $transaction: (fn: (tx: unknown) => unknown) => fn({ file: mocks.file, $queryRaw: vi.fn() }),
} }));
import { cleanFiles } from '../src/maintenance';
const old = new Date(Date.now() - 3 * 86_400_000);
const file = { id: 'file', s3Key: 'key', createdAt: old, gcMarkedAt: null as Date | null };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.file.findMany.mockResolvedValue([file]);
  mocks.file.findUnique.mockResolvedValue(file);
  mocks.refs.mockResolvedValue({ referenced: false });
  mocks.list.mockResolvedValue({ Contents: [] });
  mocks.remove.mockResolvedValue(undefined);
});
it('quarantines an unused file before deleting anything', async () => {
  await cleanFiles();
  expect(mocks.file.update).toHaveBeenCalledWith({ where: { id: file.id }, data: { gcMarkedAt: expect.any(Date) } });
  expect(mocks.remove).not.toHaveBeenCalled();
});
it('preserves attachments and avatars, restoring quarantined references', async () => {
  mocks.file.findUnique.mockResolvedValue({ ...file, gcMarkedAt: old });
  mocks.refs.mockResolvedValueOnce({ referenced: false }).mockResolvedValueOnce({ referenced: true });
  await cleanFiles();
  expect(mocks.file.update).toHaveBeenCalledWith({ where: { id: file.id }, data: { gcMarkedAt: null } });
  expect(mocks.remove).not.toHaveBeenCalled();
});
it('does not interpret an unavailable reference service as unreferenced', async () => {
  mocks.refs.mockRejectedValue(new Error('timeout'));
  await expect(cleanFiles()).rejects.toThrow('timeout');
  expect(mocks.remove).not.toHaveBeenCalled();
  expect(mocks.file.update).not.toHaveBeenCalled();
});
it('retains metadata when object deletion fails, allowing retry', async () => {
  mocks.file.findUnique.mockResolvedValue({ ...file, gcMarkedAt: old });
  mocks.remove.mockRejectedValue(new Error('MinIO unavailable'));
  await expect(cleanFiles()).rejects.toThrow('MinIO unavailable');
  expect(mocks.file.delete).not.toHaveBeenCalled();
});
it('collects aged blobs without metadata but preserves recent uploads', async () => {
  mocks.file.findMany.mockResolvedValue([]);
  mocks.file.findUnique.mockResolvedValue(null);
  mocks.list.mockResolvedValue({ Contents: [{ Key: 'old', LastModified: old }, { Key: 'new', LastModified: new Date() }] });
  await cleanFiles();
  expect(mocks.remove).toHaveBeenCalledExactlyOnceWith('old');
});

it('refuses collection on a malformed reference response', async () => {
  mocks.refs.mockResolvedValue({});
  await expect(cleanFiles()).rejects.toThrow();
  expect(mocks.remove).not.toHaveBeenCalled();
});

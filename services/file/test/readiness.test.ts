import { expect, it, vi } from 'vitest';
const send = vi.hoisted(() => vi.fn());
vi.mock('../src/config', () => ({ config: { s3Endpoint: 'http://localhost:9000', s3Bucket: 'files' } }));
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: class { send = send; }, HeadBucketCommand: class { constructor(public input: unknown) {} },
  CreateBucketCommand: class {}, PutObjectCommand: class {}, GetObjectCommand: class {},
  DeleteObjectCommand: class {}, ListObjectsV2Command: class {},
}));
import { checkStorage } from '../src/storage';
it('checks the configured bucket with an abort deadline and propagates storage failure', async () => {
  send.mockRejectedValue(new Error('MinIO down'));
  await expect(checkStorage()).rejects.toThrow('MinIO down');
  expect(send).toHaveBeenCalledWith(expect.objectContaining({ input: { Bucket: 'files' } }), { abortSignal: expect.any(AbortSignal) });
});

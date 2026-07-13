import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { Readable } from 'node:stream';
import { config } from './config';

// MinIO speaks the S3 API; forcePathStyle is required for non-AWS endpoints.
export const s3 = new S3Client({
  endpoint: config.s3Endpoint,
  region: 'us-east-1',
  forcePathStyle: true,
  credentials: { accessKeyId: config.s3AccessKey, secretAccessKey: config.s3SecretKey },
});

export async function ensureBucket(): Promise<void> {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: config.s3Bucket }));
  } catch {
    await s3
      .send(new CreateBucketCommand({ Bucket: config.s3Bucket }))
      .catch((err: { name?: string }) => {
        if (err?.name !== 'BucketAlreadyOwnedByYou' && err?.name !== 'BucketAlreadyExists') throw err;
      });
  }
}

export async function putObject(key: string, body: Buffer, mime: string): Promise<void> {
  await s3.send(
    new PutObjectCommand({ Bucket: config.s3Bucket, Key: key, Body: body, ContentType: mime }),
  );
}

export async function getObjectStream(key: string): Promise<Readable> {
  const res = await s3.send(new GetObjectCommand({ Bucket: config.s3Bucket, Key: key }));
  return res.Body as Readable;
}

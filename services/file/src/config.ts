import { decodeB64Env, envOr, requiredEnv, param } from '@interviewhub/shared';

export const config = {
  apiRateLimit: Number(envOr('API_RATE_LIMIT', '300')),
  trustProxy: envOr('TRUST_PROXY', ''),
  maintenanceIntervalMs: Number(envOr('MAINTENANCE_INTERVAL_MS', '60000')),
  port: Number(envOr('PORT', '4004')),
  databaseUrl: envOr('DATABASE_URL', 'postgresql://file_svc:file_pw@localhost:5432/file_db'),
  jwtPublicKey: decodeB64Env('JWT_PUBLIC_KEY_B64'),
  internalToken: requiredEnv('INTERNAL_TOKEN'),
  postServiceUrl: envOr('POST_SERVICE_URL', 'http://localhost:4003'),
  userServiceUrl: envOr('USER_SERVICE_URL', 'http://localhost:4002'),
  fileGcGraceMs: Number(envOr('FILE_GC_GRACE_MS', '86400000')),
  s3Endpoint: envOr('S3_ENDPOINT', 'http://localhost:9000'),
  s3AccessKey: envOr('S3_ACCESS_KEY', 'minioadmin'),
  s3SecretKey: envOr('S3_SECRET_KEY', 'minioadmin'),
  s3Bucket: envOr('S3_BUCKET', 'interviewhub-files'),
  maxFileBytes: 10 * 1024 * 1024, // hard product requirement: 10MB
};

export const ALLOWED_MIME_TYPES = new Set([
  // documents
  'application/pdf',
  'text/plain',
  'text/markdown',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  // images (rendered inline as media tiles)
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  // videos (played inline)
  'video/mp4',
  'video/quicktime',
]);

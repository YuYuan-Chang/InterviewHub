import { decodeB64Env, envOr, requiredEnv, param } from '@interviewhub/shared';

export const config = {
  port: Number(envOr('PORT', '4003')),
  databaseUrl: envOr('DATABASE_URL', 'postgresql://post_svc:post_pw@localhost:5432/post_db'),
  jwtPublicKey: decodeB64Env('JWT_PUBLIC_KEY_B64'),
  internalToken: requiredEnv('INTERNAL_TOKEN'),
  userServiceUrl: envOr('USER_SERVICE_URL', 'http://localhost:4002'),
  fileServiceUrl: envOr('FILE_SERVICE_URL', 'http://localhost:4004'),
};

import { decodeB64Env, envOr, requiredEnv, param } from '@interviewhub/shared';

export const config = {
  port: Number(envOr('PORT', '4005')),
  databaseUrl: envOr('DATABASE_URL', 'postgresql://comment_svc:comment_pw@localhost:5432/comment_db'),
  jwtPublicKey: decodeB64Env('JWT_PUBLIC_KEY_B64'),
  internalToken: requiredEnv('INTERNAL_TOKEN'),
  userServiceUrl: envOr('USER_SERVICE_URL', 'http://localhost:4002'),
  postServiceUrl: envOr('POST_SERVICE_URL', 'http://localhost:4003'),
  notificationServiceUrl: envOr('NOTIFICATION_SERVICE_URL', 'http://localhost:4006'),
};

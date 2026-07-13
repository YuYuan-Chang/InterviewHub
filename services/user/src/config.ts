import { decodeB64Env, envOr, requiredEnv, param } from '@interviewhub/shared';

export const config = {
  port: Number(envOr('PORT', '4002')),
  databaseUrl: envOr('DATABASE_URL', 'postgresql://user_svc:user_pw@localhost:5432/user_db'),
  jwtPublicKey: decodeB64Env('JWT_PUBLIC_KEY_B64'),
  internalToken: requiredEnv('INTERNAL_TOKEN'),
  notificationServiceUrl: envOr('NOTIFICATION_SERVICE_URL', 'http://localhost:4006'),
};

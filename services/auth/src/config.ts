import { decodeB64Env, envOr, requiredEnv, param } from '@interviewhub/shared';

export const config = {
  port: Number(envOr('PORT', '4001')),
  databaseUrl: envOr('DATABASE_URL', 'postgresql://auth_svc:auth_pw@localhost:5432/auth_db'),
  jwtPrivateKey: decodeB64Env('JWT_PRIVATE_KEY_B64'),
  jwtPublicKey: decodeB64Env('JWT_PUBLIC_KEY_B64'),
  internalToken: requiredEnv('INTERNAL_TOKEN'),
  userServiceUrl: envOr('USER_SERVICE_URL', 'http://localhost:4002'),
  accessTokenTtl: envOr('ACCESS_TOKEN_TTL', '1h'),
  refreshTokenTtlDays: Number(envOr('REFRESH_TOKEN_TTL_DAYS', '7')),
};

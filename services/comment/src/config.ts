import { decodeB64Env, envOr, requiredEnv, param } from '@interviewhub/shared';

export const config = {
  apiRateLimit: Number(envOr('API_RATE_LIMIT', '300')),
  trustProxy: envOr('TRUST_PROXY', ''),
  maintenanceIntervalMs: Number(envOr('MAINTENANCE_INTERVAL_MS', '60000')),
  port: Number(envOr('PORT', '4005')),
  databaseUrl: envOr('DATABASE_URL', 'postgresql://comment_svc:comment_pw@localhost:5432/comment_db'),
  jwtPublicKey: decodeB64Env('JWT_PUBLIC_KEY_B64'),
  internalToken: requiredEnv('INTERNAL_TOKEN'),
  userServiceUrl: envOr('USER_SERVICE_URL', 'http://localhost:4002'),
  postServiceUrl: envOr('POST_SERVICE_URL', 'http://localhost:4003'),
  kafkaBrokers: envOr('KAFKA_BROKERS', 'localhost:9092'),
};

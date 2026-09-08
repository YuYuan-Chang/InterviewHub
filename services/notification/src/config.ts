import { decodeB64Env, envOr, requiredEnv, param } from '@interviewhub/shared';

export const config = {
  apiRateLimit: Number(envOr('API_RATE_LIMIT', '300')),
  trustProxy: envOr('TRUST_PROXY', ''),
  port: Number(envOr('PORT', '4006')),
  databaseUrl: envOr('DATABASE_URL', 'postgresql://notification_svc:notification_pw@localhost:5432/notification_db'),
  jwtPublicKey: decodeB64Env('JWT_PUBLIC_KEY_B64'),
  internalToken: requiredEnv('INTERNAL_TOKEN'),
  userServiceUrl: envOr('USER_SERVICE_URL', 'http://localhost:4002'),
  kafkaBrokers: envOr('KAFKA_BROKERS', 'localhost:9092'),
};

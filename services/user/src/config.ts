import { decodeB64Env, envOr, requiredEnv, param } from '@interviewhub/shared';

export const config = {
  port: Number(envOr('PORT', '4002')),
  databaseUrl: envOr('DATABASE_URL', 'postgresql://user_svc:user_pw@localhost:5432/user_db'),
  jwtPublicKey: decodeB64Env('JWT_PUBLIC_KEY_B64'),
  internalToken: requiredEnv('INTERNAL_TOKEN'),
  kafkaBrokers: envOr('KAFKA_BROKERS', 'localhost:9092'),
  fileServiceUrl: envOr('FILE_SERVICE_URL', 'http://localhost:4004'),
};

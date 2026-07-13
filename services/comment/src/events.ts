import { createNotificationProducer } from '@interviewhub/shared';
import { config } from './config';
import { logger } from './logger';

export const notifications = createNotificationProducer({
  brokers: config.kafkaBrokers,
  clientId: 'comment-service',
  logger,
});

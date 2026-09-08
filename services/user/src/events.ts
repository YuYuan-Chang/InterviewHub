import { createNotificationProducer, drainOutbox, startJob } from '@interviewhub/shared';
import { config } from './config';
import { logger } from './logger';
import { prisma } from './db';

export const notifications = createNotificationProducer({
  brokers: config.kafkaBrokers,
  clientId: 'user-service',
  logger,
});

export function startOutbox() {
  return startJob('notification-outbox', () => drainOutbox(prisma.outbox, (event) => notifications.publish(event)), logger, 1000);
}

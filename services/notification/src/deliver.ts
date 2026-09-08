import type { NotificationEvent } from '@interviewhub/shared';
import { prisma } from './db';
import { logger } from './logger';

/**
 * Persists one notification event from Kafka. Throwing here is deliberate —
 * the consumer leaves the offset uncommitted and retries (at-least-once).
 */
export async function deliver(event: NotificationEvent): Promise<void> {
  // users never get notified about their own actions
  if (event.recipientId === event.actorId) return;

  if (!event.eventId) throw new Error('Notification event requires a delivery identity');
  await prisma.notification.createMany({
    skipDuplicates: true,
    data: {
      eventId: event.eventId,
      recipientId: event.recipientId,
      type: event.type,
      actorId: event.actorId,
      postId: event.postId ?? null,
      commentId: event.commentId ?? null,
    },
  });
  logger.info(
    { type: event.type, recipientId: event.recipientId, requestId: event.requestId },
    'notification delivered',
  );
}

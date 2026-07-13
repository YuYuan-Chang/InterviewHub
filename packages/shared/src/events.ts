import { Kafka, logLevel } from 'kafkajs';
import { z } from 'zod';
import { getRequestId } from './context';
import type { Logger } from './logging';

export const NOTIFICATIONS_TOPIC = 'interviewhub.notifications';
export const NOTIFICATIONS_DLQ_TOPIC = 'interviewhub.notifications.dlq';

export const notificationEventSchema = z.object({
  type: z.enum(['new_follower', 'new_comment', 'new_reply']),
  recipientId: z.string().uuid(),
  actorId: z.string().uuid(),
  postId: z.string().uuid().optional(),
  commentId: z.string().uuid().optional(),
  requestId: z.string().optional(),
});
export type NotificationEvent = z.infer<typeof notificationEventSchema>;

function kafkaClient(brokers: string, clientId: string): Kafka {
  return new Kafka({
    clientId,
    brokers: brokers.split(',').map((b) => b.trim()).filter(Boolean),
    logLevel: logLevel.NOTHING, // kafkajs is chatty; our pino logs cover the interesting events
    retry: { retries: 5 },
  });
}

async function ensureTopics(kafka: Kafka): Promise<void> {
  const admin = kafka.admin();
  await admin.connect();
  try {
    // idempotent: returns false if the topics already exist
    await admin.createTopics({
      topics: [
        { topic: NOTIFICATIONS_TOPIC, numPartitions: 3 },
        { topic: NOTIFICATIONS_DLQ_TOPIC, numPartitions: 1 },
      ],
      waitForLeaders: true,
    });
  } finally {
    await admin.disconnect();
  }
}

export interface NotificationProducer {
  /** Never throws — a dead broker degrades to the old fire-and-forget behavior. */
  publish(event: Omit<NotificationEvent, 'requestId'>): Promise<void>;
  disconnect(): Promise<void>;
}

export function createNotificationProducer(opts: {
  brokers: string;
  clientId: string;
  logger: Logger;
}): NotificationProducer {
  const { brokers, clientId, logger } = opts;
  const kafka = kafkaClient(brokers, clientId);
  const producer = kafka.producer({ allowAutoTopicCreation: false });
  let ready: Promise<void> | null = null; // lazy connect on first publish

  async function connect(): Promise<void> {
    await ensureTopics(kafka);
    await producer.connect();
    logger.info({ brokers }, 'kafka producer connected');
  }

  return {
    async publish(event) {
      try {
        ready ??= connect();
        await ready;
        const payload: NotificationEvent = { ...event, requestId: getRequestId() };
        await producer.send({
          topic: NOTIFICATIONS_TOPIC,
          // keyed by recipient: per-recipient ordering, even partition spread
          messages: [{ key: event.recipientId, value: JSON.stringify(payload) }],
        });
        logger.debug({ type: event.type, recipientId: event.recipientId }, 'notification event published');
      } catch (err) {
        // FAIL-OPEN: publishing a notification must never break the user action.
        ready = null; // let the next publish retry the connection
        logger.warn({ err, type: event.type }, 'notification event publish failed — event dropped');
      }
    },
    async disconnect() {
      await producer.disconnect().catch(() => {});
    },
  };
}

export interface NotificationConsumer {
  disconnect(): Promise<void>;
}

/**
 * At-least-once consumer: `handle` throwing (e.g. DB down) leaves the offset
 * uncommitted so kafkajs redelivers with backoff. Messages that cannot even be
 * parsed go to the DLQ and are skipped, so one poison message can't wedge a
 * partition. Consumers must therefore be idempotent-ish; duplicate
 * notifications are acceptable, lost ones are not.
 */
export async function runNotificationConsumer(opts: {
  brokers: string;
  groupId: string;
  logger: Logger;
  handle: (event: NotificationEvent) => Promise<void>;
}): Promise<NotificationConsumer> {
  const { brokers, groupId, logger, handle } = opts;
  const kafka = kafkaClient(brokers, groupId);
  await ensureTopics(kafka);

  const dlq = kafka.producer();
  await dlq.connect();
  const consumer = kafka.consumer({ groupId });
  await consumer.connect();
  await consumer.subscribe({ topic: NOTIFICATIONS_TOPIC, fromBeginning: true });

  await consumer.run({
    eachMessage: async ({ message, partition }) => {
      const raw = message.value?.toString() ?? '';
      let event: NotificationEvent;
      try {
        event = notificationEventSchema.parse(JSON.parse(raw));
      } catch (err) {
        logger.error({ err, partition, raw: raw.slice(0, 200) }, 'poison message — routing to DLQ');
        await dlq
          .send({ topic: NOTIFICATIONS_DLQ_TOPIC, messages: [{ value: raw }] })
          .catch((dlqErr) => logger.error({ err: dlqErr }, 'DLQ publish failed — poison message dropped'));
        return; // commit past it
      }
      await handle(event); // throws → retry, offset stays uncommitted
    },
  });
  logger.info({ topic: NOTIFICATIONS_TOPIC, groupId, brokers }, 'kafka consumer running');

  return {
    async disconnect() {
      await consumer.disconnect().catch(() => {});
      await dlq.disconnect().catch(() => {});
    },
  };
}

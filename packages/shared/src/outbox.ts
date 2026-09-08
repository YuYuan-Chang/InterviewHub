import { randomUUID } from 'node:crypto';
import { getRequestId } from './context';
import { notificationEventSchema, type NotificationEvent } from './events';

export function notificationRecord(event: Omit<NotificationEvent, 'eventId' | 'requestId'>) {
  const id = randomUUID();
  return { id, payload: { ...event, eventId: id, requestId: getRequestId() } };
}

export interface OutboxRow { id: string; payload: unknown; attempts: number }
export interface OutboxStore {
  findMany(args: { where: { availableAt: { lte: Date } }; orderBy: { availableAt: 'asc' }; take: number }): Promise<OutboxRow[]>;
  deleteMany(args: { where: { id: string } }): Promise<unknown>;
  updateMany(args: { where: { id: string }; data: { attempts: { increment: number }; availableAt: Date } }): Promise<unknown>;
}

/** Ack after Kafka confirms. Concurrent relays may duplicate; eventId deduplicates delivery. */
export async function drainOutbox(store: OutboxStore, publish: (event: NotificationEvent) => Promise<void>) {
  const rows = await store.findMany({ where: { availableAt: { lte: new Date() } }, orderBy: { availableAt: 'asc' }, take: 50 });
  for (const row of rows) {
    try {
      await publish(notificationEventSchema.parse(row.payload));
      await store.deleteMany({ where: { id: row.id } });
    } catch (err) {
      await store.updateMany({ where: { id: row.id }, data: {
        attempts: { increment: 1 },
        availableAt: new Date(Date.now() + Math.min(300_000, 1000 * 2 ** Math.min(row.attempts, 8))),
      } });
      throw err;
    }
  }
  return { processed: rows.length };
}

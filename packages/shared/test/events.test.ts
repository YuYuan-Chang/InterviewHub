import { describe, expect, it } from 'vitest';
import { NOTIFICATIONS_DLQ_TOPIC, NOTIFICATIONS_TOPIC, notificationEventSchema } from '../src/events';

const UUID = '4c9f1f9e-7b1a-4d7e-9a44-2f6f4d1a2b3c';

describe('notificationEventSchema', () => {
  it('accepts each event type with optional fields', () => {
    expect(() =>
      notificationEventSchema.parse({ type: 'new_follower', recipientId: UUID, actorId: UUID }),
    ).not.toThrow();
    expect(() =>
      notificationEventSchema.parse({
        type: 'new_comment',
        recipientId: UUID,
        actorId: UUID,
        postId: UUID,
        commentId: UUID,
        requestId: 'req-1',
      }),
    ).not.toThrow();
  });

  it('rejects unknown types and malformed ids (poison → DLQ path)', () => {
    expect(() =>
      notificationEventSchema.parse({ type: 'new_like', recipientId: UUID, actorId: UUID }),
    ).toThrow();
    expect(() =>
      notificationEventSchema.parse({ type: 'new_reply', recipientId: 'not-a-uuid', actorId: UUID }),
    ).toThrow();
    expect(() => notificationEventSchema.parse({})).toThrow();
  });

  it('topic names are stable (consumers and producers must agree)', () => {
    expect(NOTIFICATIONS_TOPIC).toBe('interviewhub.notifications');
    expect(NOTIFICATIONS_DLQ_TOPIC).toBe('interviewhub.notifications.dlq');
  });
});

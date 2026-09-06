# CLAUDE.md — notification-service

Port 4006 · database `notification_db` · owns persisted in-app notifications. It is the only **consumer** in the system: user-service and comment-service publish, this service writes rows. Read the root `CLAUDE.md` for shared conventions, and `packages/shared/src/events.ts` for the producer/consumer contract.

Beyond the standard five files: **`src/deliver.ts`** — the event handler, one function, deliberately small.

## Kafka is the only write path

There is no HTTP endpoint that creates a notification. Events arrive on `interviewhub.notifications` through `runNotificationConsumer`, started in `index.ts`. `routes.ts` is read + read-state only.

`index.ts` starts the consumer in a **retry loop with a 5s backoff** and does not await it, so the HTTP API serves reads even when the broker is unavailable. A missing broker must never fail the boot. Shutdown is coordinated: `installGracefulShutdown` flips `stopped`, disconnects the consumer, then Prisma and tracing.

## deliver() throwing is the retry mechanism

The consumer is at-least-once. When `deliver()` throws (database down, say), the offset stays uncommitted and kafkajs redelivers with backoff. **Don't wrap it in a try/catch** — swallowing the error silently drops the notification. Messages that can't even be parsed are routed to `interviewhub.notifications.dlq` by the shared consumer before `deliver()` sees them, so a poison message can't wedge a partition.

The flip side: redelivery is normal, so inserts must tolerate it. If duplicates ever need suppressing, that's a unique constraint plus a migration, not a catch in the handler.

`deliver()` also drops self-notifications (`recipientId === actorId`) — you don't get notified about your own comment on your own post.

## Recipient scoping is the security boundary

Every query filters on `recipientId: user.id`. The mark-as-read handler uses `updateMany({ where: { id, recipientId } })` rather than `update({ where: { id } })` — that `AND` is what stops one user marking another's notifications, and it makes the operation idempotent for free. Keep `updateMany`.

## Gotchas

- The list route clamps with `clampLimit(q.limit, 20, 100)` — a higher ceiling than the shared default of 50.
- Pagination is keyset on `createdAt DESC`, backed by the `[recipientId, createdAt desc]` index; `unreadCount` is a separate count over the `[recipientId, read]` index and is always the total, not the page's.
- Actor hydration is one batched `/internal/profiles/batch` call with a `.catch()` → `actor: null`. The list stays up when user-service is down.
- `type` is a plain `String` column; the allowed values live in the zod enum in shared (`new_follower | new_comment | new_reply`). Adding a type means updating shared's schema, every publisher, and the frontend's rendering together — the column won't stop you.

Only `0_init` exists under `prisma/migrations/`. Local event testing needs Kafka and Postgres up.

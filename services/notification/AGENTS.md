# Notification Service Guidelines

## Scope and Structure

This service owns persisted in-app notifications and consumes notification events from Kafka. API listing and read-state handlers live in `src/routes.ts`; event-to-row handling belongs in `src/deliver.ts`; consumer startup and shutdown are coordinated from `src/index.ts`. Actor display data is fetched from user-service and is not stored as a second profile source.

Follow `../../AGENTS.md`. Keep notification persistence local to this service, use protected batch profile APIs for enrichment, and do not query producer or user databases.

## Development and Verification

- `npm run prisma:generate -w @interviewhub/notification-service` regenerates Prisma types.
- `npm run build -w @interviewhub/notification-service` compiles and type-checks.
- `npm run dev -w @interviewhub/notification-service` starts port 4006 in watch mode.
- `npm test -w @interviewhub/notification-service` runs its Vitest suite.

Local event testing requires Kafka and Postgres. Run the root `npm run smoke` for consumer, follower/comment notification, read-state, or enrichment changes.

## Implementation Rules

Treat Kafka delivery as at-least-once: handlers must tolerate redelivery and must not acknowledge failures that need retry. Preserve DLQ handling for malformed events so one poison message cannot block a partition. Keep event validation aligned with `@interviewhub/shared`; update producers and consumers together when changing a contract.

Notification queries must be scoped to the authenticated recipient. Mark-one and mark-all operations should remain idempotent, and users must never mutate another recipient's rows. Batch actor enrichment and degrade safely when user-service is unavailable. Preserve tracing-first initialization and graceful consumer shutdown in `src/index.ts`.

## Tests and Schema Changes

Add Vitest files under `test/*.test.ts`. Cover recipient isolation, pagination, idempotent read operations, duplicate delivery, malformed events, DLQ behavior, and missing actors. Commit numbered Prisma migrations for persistence changes; never use `db push` or commit service `.env` files.

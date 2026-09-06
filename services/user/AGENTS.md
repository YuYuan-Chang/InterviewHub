# User Service Guidelines

## Scope and Structure

This service owns profiles, people search, and the follow graph. Profile routes live in `src/profiles.ts`; follow routing and data access are isolated in `src/follows/`; protected service-to-service endpoints live in `src/internal.ts`. `src/events.ts` publishes follower notifications, while `prisma/` owns the user database schema and migrations.

Follow `../../AGENTS.md` for repository-wide conventions. Do not move follow data into another database or query auth, post, or notification tables directly. Other services consume profile and following data through `/internal/*` endpoints protected by `requireInternal`.

## Development and Verification

- `npm run prisma:generate -w @interviewhub/user-service` regenerates Prisma types.
- `npm run build -w @interviewhub/user-service` compiles and type-checks.
- `npm run dev -w @interviewhub/user-service` starts port 4002 in watch mode.
- `npm test -w @interviewhub/user-service` runs service tests.

Run `npm run build:shared` after shared-contract changes. Use the root smoke test for registration, profile editing, following, feeds, or Kafka notification changes.

## Implementation Rules

Use zod plus shared validation helpers for inputs and keyset cursors for lists. Keep batch profile lookup capped and preserve the followee cap used by post-service. Follow/unfollow operations must remain idempotent; publish `new_follower` only when a new edge was created. Notification publishing is fail-open and must not turn a successful follow into an error.

Avoid per-profile query fan-out when extending search or lists. Prefer one batched profile query and grouped counts over repeated `findUnique`/`count` calls. Keep environment reads in `src/config.ts` and preserve tracing-first startup in `src/index.ts`.

## Tests and Schema Changes

Add Vitest files under `test/*.test.ts`. Cover self-follow rejection, duplicate follows, pagination boundaries, profile validation, and missing batch IDs. Schema changes require a numbered migration such as `2_profile_field`; never use cross-database foreign keys or replace migrations with `db push`.

# Comment Service Guidelines

## Scope and Structure

This service owns threaded comments and comment reactions. HTTP behavior is in `src/routes.ts`, pure flat-to-tree conversion is in `src/tree.ts`, and Kafka notification publishing is configured in `src/events.ts`. Post existence and author data come from protected APIs; post rows, profiles, and notification records are not owned here.

Follow `../../AGENTS.md`. Keep the tree builder pure and independent of Express or Prisma. Do not query other service databases or expose internal routes through the gateway.

## Development and Verification

- `npm run prisma:generate -w @interviewhub/comment-service` regenerates Prisma types.
- `npm run build -w @interviewhub/comment-service` compiles and type-checks.
- `npm run dev -w @interviewhub/comment-service` starts port 4005 in watch mode.
- `npm test -w @interviewhub/comment-service` runs Vitest, including `test/tree.test.ts`.
- `npx vitest run services/comment/test/tree.test.ts` runs the tree suite directly.

Run the root smoke test for comment creation, reactions, notifications, or cross-service counter changes.

## Implementation Rules

Validate post and parent relationships before inserts. Preserve input ordering among siblings, recursive nesting, and the current behavior that surfaces orphaned replies as roots. Batch author enrichment rather than requesting each profile separately.

Reaction writes and denormalized upvote counters must remain atomic and idempotent. Comment creation publishes Kafka notifications fail-open; broker failures must not fail the user action. Post comment-count changes use the existing service-to-service callback and must remain internal. Preserve request IDs across both paths.

Use shared auth, validation, error, and S2S helpers. Keep tracing initialization before the dynamic app import in `src/index.ts`.

## Tests and Schema Changes

Place tests in `test/*.test.ts`. Extend tree tests for ordering, deep replies, orphans, and empty input. Add route coverage for invalid parents, missing posts, ownership rules, duplicate reactions, and downstream degradation. Commit numbered Prisma migrations and do not replace them with `db push`.

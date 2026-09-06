# Post Service Guidelines

## Scope and Structure

This service owns posts, tags, attachment manifests, feeds, post reactions, and denormalized post counters. Public handlers are in `src/routes.ts`; feed filtering and pagination belong in `src/feed.ts`; cross-service author enrichment is in `src/enrich.ts`; comment-service callbacks are exposed through `src/internal.ts`. File bytes and comments remain owned by their respective services.

Follow `../../AGENTS.md`. Never query user-, file-, or comment-service databases. Use `s2sClient` and protected `/internal/*` contracts, batch remote lookups, and preserve graceful degradation where enrichment intentionally returns `author: null`.

## Development and Verification

- `npm run prisma:generate -w @interviewhub/post-service` regenerates Prisma types.
- `npm run build -w @interviewhub/post-service` compiles and type-checks.
- `npm run dev -w @interviewhub/post-service` starts port 4003 with watch mode.
- `npm test -w @interviewhub/post-service` runs its Vitest tests.

Use the root `npm run smoke` for feed, upload attachment, reaction, or comment-count changes.

## Implementation Rules

Keep feed parsing in `feed.ts`, normalize tags to trimmed lowercase values, and use keyset pagination rather than offsets. Register fixed paths such as `/api/posts/tags/popular` before parameter routes like `/api/posts/:id`. Verify every attachment through file-service and enforce uploader ownership before creating a post.

Reaction writes and counter changes must stay in one Prisma transaction and remain idempotent. Treat the comment-count callback as internal-only. When extending enriched responses, batch service calls rather than introducing N+1 requests.

Keep `src/index.ts` tracing initialization before the dynamic app import. Use shared auth, validation, errors, pagination, and request-context utilities.

## Tests and Schema Changes

Place Vitest files in `test/*.test.ts`. Cover filter combinations, cursor behavior, tag normalization, ownership failures, idempotent upvotes, and counter integrity. Commit numbered Prisma migrations and consider indexes whenever adding feed filters or sort keys; do not use `db push`.

# CLAUDE.md — comment-service

Port 4005 · database `comment_db` · owns threaded comments and comment reactions. Post rows, profiles and notification records belong elsewhere. Read the root `CLAUDE.md` for shared conventions.

Beyond the standard five files: **`src/tree.ts`** (flat → nested, pure) and **`src/events.ts`** (Kafka producer).

## tree.ts stays pure

`buildTree()` imports nothing — no Express, no Prisma — which is why it's the one piece of this service with real unit tests (`test/tree.test.ts`, runnable directly with `npx vitest run services/comment/test/tree.test.ts`). Keep it that way.

Two behaviors the tests pin down: sibling order follows input order (the query sorts `createdAt asc`), and a reply whose parent isn't in the fetched set surfaces as a **root** rather than disappearing. That second one is intentional — a comment must never vanish from a thread.

## Reads are capped, not paginated

`GET /api/comments/post/:postId` takes 500 comments in one query, hydrates them, and builds the tree in memory. There is no cursor. Adding pagination means rethinking tree building, because a page boundary can separate a reply from its parent — which is exactly the orphan case above.

Author hydration is one batched `/internal/profiles/batch` call that catches failures and falls back to `author: null`, plus one reactions query. Don't fetch profiles per comment.

## Two side effects, two transports — on purpose

After a successful insert:

1. **Comment count** → REST to post-service `/internal/posts/:postId/comment-count` through `fireAndForget`. This is synchronous counter state, not an event.
2. **Notification** → Kafka `interviewhub.notifications`. Durable if notification-service is down, fail-open if the broker is down.

Don't unify these onto one transport. The request id propagates across both paths, so one comment is greppable end to end.

Recipient routing: a reply notifies the **parent comment's** author (`new_reply`); a top-level comment notifies the **post's** author (`new_comment`). Self-notifications are dropped downstream in notification-service's `deliver.ts`, not here.

## Validation before insert

The post must exist — `postService.get('/internal/posts/:id')` both proves that and supplies the author for the notification, so it isn't a redundant call. When `parentId` is given, the parent's `postId` must match the path's `postId`, otherwise 400; without that check a reply could be grafted onto a different post's thread.

## Counters

Upvotes mirror post-service exactly: `$transaction`, `createMany` with `skipDuplicates` (or `deleteMany`), counter moves only when the row count changed, `P2003` → 404. Keep the two implementations in step.

Only `0_init` exists under `prisma/migrations/`.

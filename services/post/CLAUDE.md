# CLAUDE.md — post-service

Port 4003 · database `post_db` · owns posts, tags, attachment manifests, feeds, post reactions, and the denormalized `upvote_count` / `comment_count` columns. File bytes belong to file-service and comment rows to comment-service. Read the root `CLAUDE.md` first — `src/enrich.ts` is the repo's reference implementation of cross-service enrichment.

Beyond the standard five files: **`src/feed.ts`** (query shaping, tag parsing, popular tags), **`src/enrich.ts`** (batched author + viewer-reaction hydration), **`src/internal.ts`** (comment-service callbacks).

## Route order

`/api/posts/tags/popular` is registered **before** `/api/posts/:id`, or Express captures `tags` as a post id. Any new fixed `/api/posts/<word>` path has to go above the param route too.

## Attachments

New posts store a JSON array on `attachments` — `{ fileId, name, mime, sizeBytes }`, at most 8. The legacy single-file columns (`file_id`, `file_name`, `file_mime`, `file_size`) still hold data for old rows, and `attachmentsOf()` in `enrich.ts` synthesizes them into the array shape on read. Don't drop those columns without a migration that backfills `attachments` first.

Creation merges `fileId` (legacy single-file clients) and `fileIds`, dedupes, then fetches every id from file-service `/internal/files/:id` and rejects the post unless the caller owns all of them. The stored manifest is post-service's own copy of that metadata — it is not re-fetched on read.

## Feeds

`queryFeed()` uses Prisma's `cursor: { id }, skip: 1` keyset paging, and every `orderBy` ends with `id: 'desc'` as the tiebreaker. With `sort=popular` the ranking is mutable, so a post can repeat or be skipped across pages — that is the accepted trade-off, not a bug to patch with offsets.

Tag filtering is AND semantics via `hasEvery`. `tag` (single, from tag links) and `tags` (comma-separated, from the filter bar) merge into one lowercased list capped at 8; the GIN index on `tags` backs it. `popularTags()` is raw SQL over `unnest(tags)` and returns `bigint`, so the counts are cast with `Number()`.

The Following feed fetches followee ids from user-service first and short-circuits to an empty page when there are none — before touching the database.

## Enrichment must degrade, not fail

`enrichPosts()` issues exactly two queries: one batched `/internal/profiles/batch` and one reactions lookup. The profile call has a `.catch()` that logs and returns no profiles, so posts render with `author: null` when user-service is down. Preserve that catch, and preserve the batching — a per-post profile fetch turns every feed page into an N+1.

## Counters

Upvote and un-upvote both run in a `$transaction`: `createMany`/`deleteMany` first, and the counter only moves when the row count changed. That is what makes repeat calls idempotent. A `P2003` foreign-key violation means the post doesn't exist and maps to 404.

`/internal/posts/:id/comment-count` deliberately swallows update failures — the post may have been deleted between the comment insert and the callback.

Only `0_init` exists under `prisma/migrations/`. Adding a feed filter or sort key usually means adding an index in the same migration.

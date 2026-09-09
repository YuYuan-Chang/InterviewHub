# InterviewHub — Service Reference

Internal service documentation, generated from the code as-built (July 2026). Every route, field, and type below is taken from the source — file paths are cited so you can verify. The reliability contracts below were updated in September 2026; see [Production reliability](RELIABILITY.md) for implementation guarantees and operations.

Two corrections to the requested outline, from the actual repo:

- **There is no standalone follow service.** The follow graph is a module inside user-service (`services/user/src/follows/`), deliberately isolated behind its own routes/data-access files as an extraction seam. It is documented as §3 of the user-service section.
- **The stack is Node/TypeScript, not Python.** ORM models are **Prisma** schemas (`services/*/prisma/schema.prisma`), and request validation is **zod** (inline in each `routes.ts`) — these fill the roles SQLAlchemy and Pydantic would in a Python codebase.

---

## Reliability additions

See [Production reliability](RELIABILITY.md) for defaults, worker scheduling and rollout. Schema additions: all services own `rate_limits(key,hits,expires_at)`; user/comment own `outbox(id,payload,attempts,available_at,created_at)`; notifications have unique nullable `event_id` for rolling migration compatibility; files have nullable `gc_marked_at`.

New protected endpoints: post/user `GET /internal/file-references/:id` → `{ referenced: boolean }`; comment `GET /internal/comments/post/:id/count` → `{ count: number }`. File ownership verification rejects quarantined files. All readiness checks have a response deadline, and file readiness additionally checks MinIO.

## 0 · Conventions shared by every service

All six services are Express 5 apps built from one skeleton and one shared package, [`packages/shared`](../packages/shared/src). Understanding this section once means each service section only documents its differences.

**Auth middlewares** (`shared/src/auth.ts`)

| Middleware | Behavior |
|---|---|
| `requireAuth(publicKey)` | Requires `Authorization: Bearer <JWT>`; verifies RS256 locally against the public key. Sets `req.user = { id, email }` (from `sub`/`email` claims). Missing → `401 Missing bearer token`; invalid/expired → `401 Invalid or expired token`. |
| `optionalAuth(publicKey)` | Same, but anonymous or invalid tokens pass through with `req.user = undefined`. Used on read endpoints that personalize when possible (`viewerHasUpvoted`, `isFollowing`). |
| `requireInternal(token)` | Requires header `x-internal-token: <shared secret>` — guards every `/internal/*` route. Wrong/missing → `401 Invalid internal token`. The gateway additionally never routes `/internal/*`, so these are double-protected. |

**Error shape** (`shared/src/errors.ts`) — every error responds `{ "error": string, "details"?: unknown }`. Validation failures are `400 { error: "Validation failed", details: ["field: message", …] }`. Unhandled exceptions log server-side and return `500 { error: "Internal server error" }`. Multer's file-size limit is mapped to `413 { error: "File exceeds the 10MB limit" }`. Unknown paths → `404 { error: "Not found" }`.

**Health** (`shared/src/health.ts`) — every service exposes `GET /livez` (process up; k8s liveness) and `GET /healthz` (runs `SELECT 1` against its DB; k8s readiness → `503` when the DB is unreachable; file-service also checks MinIO).

**Pagination** (`shared/src/pagination.ts`) — keyset cursors, never OFFSET. A cursor is base64url-encoded JSON of the last-seen sort key; malformed cursors → `400 Malformed cursor`. `clampLimit(raw, fallback=20, max=50)` bounds every `limit` param.

**S2S client** (`shared/src/s2s.ts`) forwards internal authentication and request IDs. It preserves 404/409 statuses and maps dependency failures to 502. `fireAndForget` logs optional side-effect failures.

**S2S isolation:** 3-second total deadlines, up to two retries for safe GET calls, and per-client circuit breakers. Mutations never automatically retry. See [Reliability](RELIABILITY.md).

**Rate limiting:** all public APIs have shared database buckets; auth adds stricter IP and account limits. Returns 429 with Retry-After; health/internal routes are exempt. See [configuration](RELIABILITY.md#request-protection).

**Config** — 12-factor, env vars only (each service's `src/config.ts`). Notable: JWT keys travel base64-encoded (`JWT_PUBLIC_KEY_B64`, private key only in auth-service); `INTERNAL_TOKEN` is required (no default); service URLs default to `http://localhost:400x` for bare-metal dev and are overridden to service DNS names in Compose/k8s.

---

## 1 · auth-service

`services/auth` · port **4001** · database **auth_db** · the only holder of the JWT **private** key

### 1.1 Purpose & responsibility

**Owns:** credentials (email + bcrypt hash), issuance of RS256 access tokens, and rotating single-use refresh tokens. It is the only service that can *mint* identity.

**Why separate:** the private signing key and password hashes are the highest-value secrets in the system; isolating them minimizes the surface that can leak them. Every other service verifies tokens locally with the public key — auth-service is *not* on the hot path of any authenticated request.

**Does not handle:** profiles (username, school, bio live in user-service — auth stores only email + hash); authorization decisions (ownership checks live in each owning service); sessions (stateless JWTs; the only server-side state is refresh tokens).

### 1.2 API

| Endpoint | Auth | Request body (zod) | Success | Errors |
|---|---|---|---|---|
| `POST /api/auth/register` | none | `email` (email, ≤254) · `password` (8–128) · `username` (3–30, `[a-zA-Z0-9_]`) · `displayName` (1–80) · `school?` (≤120, default `""`) · `targetRoles?` (string[≤60][], ≤10, default `[]`) | `201 { accessToken, refreshToken, user: { id, email } }` | `400` validation · `409` email exists · `409` username taken (surfaced from user-service; credential row rolled back) |
| `POST /api/auth/login` | none | `email` · `password` | `200` token pair (same shape) | `401 Invalid email or password` (identical for unknown email vs wrong password — no user enumeration) |
| `POST /api/auth/refresh` | none | `refreshToken` (string) | `200` **new** token pair (old refresh token deleted — single-use rotation) | `401 Invalid or expired refresh token` |
| `POST /api/auth/logout` | none | `refreshToken` | `204` (idempotent — deletes the hash if present) | — |
| `GET /api/auth/me` | JWT | — | `200 { id, email }` (pure token echo, no DB read) | `401` |
| `POST /api/auth/token` | JWT | — | `200 { accessToken }` (re-issue from a still-valid token) | `401` |

No internal endpoints. Emails are lowercased before storage/lookup. Access-token TTL defaults to `1h` (`ACCESS_TOKEN_TTL`), refresh TTL to 7 days (`REFRESH_TOKEN_TTL_DAYS`). JWT payload: `{ sub: userId, email, iat, exp }`, algorithm pinned to RS256 on both sign and verify.

### 1.3 Database — `auth_db`

| Table | Columns | Constraints & indexes |
|---|---|---|
| `users` | `id` uuid PK (default uuid) · `email` text · `password_hash` text · `created_at` timestamptz default now() | UNIQUE(`email`) |
| `refresh_tokens` | `id` uuid PK · `user_id` uuid · `token_hash` text · `expires_at` timestamptz · `created_at` | UNIQUE(`token_hash`) · INDEX(`user_id`) · FK `user_id`→`users.id` ON DELETE CASCADE |

Prisma models `User` / `RefreshToken` map 1:1 (camelCase fields `@map`-ed to snake_case columns). Raw refresh tokens are never stored — only their SHA-256 hex hash; the raw 96-hex-char token exists only in the client.

**Reads vs writes:** register/login/refresh/logout all write; `me`/`token` are read-free. No multi-statement DB transactions — the interesting atomicity problem is *cross-service* (below). On refresh, expired tokens for that user are pruned via `fireAndForget` (best-effort cleanup, not correctness).

**Flag:** deleting a user cascades refresh tokens, but nothing deletes the user-service profile or the user's posts/comments — account deletion as a product feature does not exist.

### 1.4 Inter-service communication

**Calls:** exactly one — `POST {user-service}/internal/profiles` during registration (synchronous, blocking).

**Failure behavior — the registration saga:** credential row is created first; if the profile call fails for any reason, auth **deletes its own credential row** (compensating action) and re-throws — a 409 for username conflicts, 502 otherwise. If the compensation itself fails (`.catch(() => {})`), an orphaned credential row remains: the user can log in but has no profile, and `GET /api/users/me` returns 404. Known, accepted gap at this scale.

---

## 2 · user-service

`services/user` · port **4002** · database **user_db** · profiles **and** the follow graph

### 2.1 Purpose & responsibility

**Owns:** public identity (username, displayName, school, targetRoles, bio), people search, and the follow graph.

**Why profiles are separate from auth:** display data changes freely and is read by everything; credentials are write-rarely, security-critical. Different change rates, different blast radius.

**Does not handle:** credentials or tokens (auth-service); content (post/comment services enrich author info *through* this service's internal batch endpoint rather than storing names).

### 2.2 API — profiles (`src/profiles.ts`)

All profile responses share one shape: the profile row **plus** `followerCount`, `followingCount` (live `COUNT(*)`s) and `isFollowing` (false when anonymous).

| Endpoint | Auth | Request | Success | Errors |
|---|---|---|---|---|
| `GET /api/users/me` | JWT | — | `200` profile+counts | `404 Profile not found` (possible only via the orphaned-registration gap) |
| `PATCH /api/users/me` | JWT | any of `displayName` (1–80) · `school` (≤120) · `targetRoles` (≤10×≤60) · `bio` (≤2000) — all optional | `200` updated profile+counts | `400` validation |
| `GET /api/users/search?q=` | optional | `q` 1–100 chars (trimmed) | `200 { items: [profile+counts] }`, ≤20, ordered `createdAt asc` | `400` missing q |
| `GET /api/users/by-username/:username` | optional | — | `200` profile+counts | `404` |
| `GET /api/users/by-id/:userId` | optional | — | `200` profile+counts | `404` |

Search matches `username OR displayName OR school` with case-insensitive `contains` (ILIKE). **No pagination on search** — hard `take: 20`.

### 2.3 API — follows (`src/follows/routes.ts`, logic in `src/follows/service.ts`)

| Endpoint | Auth | Success | Errors |
|---|---|---|---|
| `POST /api/users/:userId/follow` | JWT | `201 { followerCount, followingCount }` if edge created; `200` same body if it already existed (idempotent via `createMany … skipDuplicates`) | `400 You cannot follow yourself` · `404 User not found` (target profile checked first) |
| `DELETE /api/users/:userId/follow` | JWT | `200` counts (idempotent — `deleteMany`) | — |
| `GET /api/users/:userId/followers?cursor&limit` | none | `200 { items: [{ userId, username, displayName, school }], nextCursor }` | `400` bad cursor |
| `GET /api/users/:userId/following?cursor&limit` | none | same shape | same |

Follower/following lists paginate by `createdAt` keyset (cursor payload `{ before: ISO }`), newest edges first, limit clamped 20/50. Note the lists are **public** (no auth middleware) — counts are public on profiles anyway; a deliberate simplification.

### 2.4 API — internal (`src/internal.ts`)

| Endpoint | Caller | Contract |
|---|---|---|
| `POST /internal/profiles` | auth-service (registration) | body `{ userId: uuid, username, displayName, school?, targetRoles? }` → `201` profile; unique violation (username *or* userId) → `409 Username or user already exists` |
| `GET /internal/users/:userId/following` | post-service (Following feed) | `200 { ids: string[] }` — **capped at 1000 followees** (`followingIds(userId, cap=1000)`); beyond that, silent truncation |
| `POST /internal/profiles/batch` | post/comment/notification (author enrichment) | body `{ ids: uuid[] }` (≤200) → `200 { profiles: [{ userId, username, displayName, school }] }`; unknown ids silently omitted |

### 2.5 Database — `user_db`

| Table | Columns | Constraints & indexes |
|---|---|---|
| `profiles` | `user_id` uuid **PK (not generated — comes from auth)** · `username` text · `display_name` text · `school` text default `''` · `target_roles` text[] · `bio` text default `''` · `created_at` | UNIQUE(`username`) |
| `follows` | `follower_id` uuid · `followee_id` uuid · `created_at` | **PK(`follower_id`,`followee_id`)** (an edge can exist once) · INDEX(`followee_id`) — so both “who do I follow” (PK prefix) and “who follows me” (index) are single index scans |

No FK between `follows` and `profiles` — and no FK to `auth_db.users` is *possible* (different database). Referential integrity across services is by convention: `user_id` is minted by auth and never changes.

**Transactions:** new follow edges and their notification outbox entries commit atomically; duplicate edges do not enqueue another event.

**⚠️ N+1, the worst in the codebase:** `GET /api/users/search` calls `withCounts()` per result, and `withCounts` issues 2 `COUNT(*)`s + 1 `findUnique` — so a full 20-row search executes up to **1 + 20×3 = 61 queries**. Same pattern (×1) on every profile read, which is fine; the search fan-out is the flag. Fix would be a grouped count query or denormalized counters. `followers`/`following` lists do it right: one edge query + one batched profile `findMany`.

### 2.6 Inter-service communication

**Publishes:** new-follower events through the local transactional outbox and Kafka, only when a new edge is inserted.

**Failure behavior:** notification-service or Kafka outages leave events durable in Kafka or the producer outbox; follow requests succeed once their local transaction commits.

---

## 3 · post-service

`services/post` · port **4003** · database **post_db** · posts, feeds, tags, post upvotes, saved posts & collections — the busiest service

### 3.1 Purpose & responsibility

**Owns:** post metadata (title, description, normalized lowercase tags, attachment manifest), both feeds (Explore incl. search + filters, Following), the popular-tags aggregation, post upvotes, bookmarks and user collections, and three denormalized counters (`upvote_count` and `collections.item_count` maintained locally, `comment_count` maintained via callback from comment-service).

**Does not handle:** file bytes (file-service; posts store only an attachment manifest copied from file-service metadata at creation); comments (separate DB entirely — posts only carry the count); author display data (fetched per-request from user-service, never stored).

### 3.2 API — public

Structured interview experiences are supported by `POST /api/posts` with `type: "experience"` and required `interviewExperience: { company, role, stage, questions, difficulty, outcome }`. Validation is defined in `src/schemas.ts`; omitted `type` defaults to `material`, and materials cannot include interview details. Creation inserts the post and related details atomically through a nested Prisma create. See the README's Interview experience API section for limits and allowed values.

Every enriched post also includes `type: "material" | "experience"` and `interviewExperience` (null for materials). Both feeds support `type`, `company`, `role`, `stage`, `difficulty`, and `outcome` filters, combined with the existing filters and pagination. Company and role use case-insensitive substring matching; stage, difficulty, and outcome are exact matches. Free-text `q` additionally searches company, role, and questions. Type is derived from the presence of related details, so existing posts require no backfill.

**Enriched post shape** (returned everywhere; built in `src/enrich.ts`): all `posts` columns, `createdAt` as ISO string, `attachments: [{ fileId, name, mime, sizeBytes }]` (legacy single-file rows are synthesized into this array), `author: { userId, username, displayName, school } | null`, `viewerHasUpvoted: boolean` (always false when anonymous).

| Endpoint | Auth | Request | Success | Errors |
|---|---|---|---|---|
| `POST /api/posts` | JWT | `title` (3–160) · `description?` (≤5000, default `""`) · `tags?` (≤8, each 1–60, trimmed+lowercased, deduped) · `fileIds?` (uuid[], ≤8) · `fileId?` (uuid, legacy — merged into fileIds) | `201` enriched post | `400` validation / >8 merged ids · `403 You can only attach files you uploaded` · `404` unknown fileId (bubbled from file-service) |
| `GET /api/posts/feed/explore` | optional | query: `sort` = `recent`\|`popular` (default recent) · `q?` (1–100, matches title/description ILIKE or exact lowercase tag) · `tags?` (comma-list, ≤8, **AND** semantics via `hasEvery`) · `tag?` (single, merged into tags) · `authorId?` (uuid — powers profile pages) · `cursor?` · `limit?` (clamped 20/50) | `200 { items: [enriched], nextCursor }` | `400` bad cursor/validation |
| `GET /api/posts/feed/following` | JWT | same query params | same shape; `{ items: [], nextCursor: null }` short-circuit when following nobody | `502` if user-service is down (this feed **hard-depends** on it) |
| `GET /api/posts/tags/popular` | none | — | `200 { tags: [{ tag, count }] }`, top 20 | — |
| `GET /api/posts/:id` | optional | — | `200` enriched post | `404` |
| `DELETE /api/posts/:id` | JWT | — | `204` | `403 Only the author can delete a post` · `404` |
| `PUT /api/posts/:id/upvote` | JWT | — | `200 { upvoteCount, viewerHasUpvoted: true }` — idempotent | `404` (FK violation P2003 mapped) |
| `DELETE /api/posts/:id/upvote` | JWT | — | `200 { upvoteCount, viewerHasUpvoted: false }` — idempotent | `404` |

Pagination is keyset via Prisma's cursor API: the cursor payload is `{ afterId: <last post id> }`; ordering is `(created_at DESC, id DESC)` or, for popular, `(upvote_count DESC, created_at DESC, id DESC)`. Documented quirk (comment in `feed.ts`): cursoring over the *popular* ranking while counts change can repeat/skip a post across pages.

`GET /api/posts/tags/popular` is registered **before** `GET /api/posts/:id` — Express matches in order, otherwise `tags` would parse as a post id.

### Resume review

Post-service owns editable resume text and its revision history in `post_db`. `POST /api/posts` optionally accepts `resumeText` (nonblank, max 20,000 characters and 500 lines; CRLF normalized to LF). Responses include nullable `resumeText` and `resumeVersion` (initially 1). Existing posts remain ordinary resources. PDF attachments are reference copies and are never rewritten by a revision.

| Endpoint | Auth | Contract |
|---|---|---|
| `GET /api/posts/:id/revisions` | public | Keyset-paginated `{ items, nextCursor }`; `cursor?`, `limit?` (default 20, max 50). Each proposal includes its author (batched user-service lookup, null on failure), base version, summary, proposed text, unified patch, status and timestamps. |
| `POST /api/posts/:id/revisions` | JWT | `{ baseVersion, summary, proposedText }` or `{ baseVersion, summary, patch }`; exactly one input. Summary is 3–1000 trimmed characters. Patch max 100,000 characters; single-file unified diffs only, matched with zero fuzz. Returns `201` proposal. |
| `PATCH /api/posts/:id/revisions/:revisionId` | owner JWT | `{ status: "accepted" | "rejected" }`. Acceptance updates text and increments version. Returns resolved proposal. |

Invalid/empty/no-op revisions return `400`, missing posts/proposals `404`, non-owner decisions `403`, and stale versions or already resolved decisions `409`. Only pending proposals may be resolved; outdated proposals can still be rejected. Parent-row locking serializes proposal creation and decisions so simultaneous accepts cannot overwrite one another. Patches are applied only to strings, never filesystem paths. Resume text is displayed literally; Markdown/HTML is not executed.

Migration `1_resume_revisions` adds `posts.resume_text`, `posts.resume_version`, and `resume_revisions` with a cascading post foreign key and a `(post_id, created_at DESC, id DESC)` pagination index. Resume history is stored locally; file bytes and discussion comments retain their existing owners. No new internal routes or notification event types are added. The post-service JSON request limit is 256 KB to accommodate patch payloads.

### Bookmarks & collections

Post-service owns saved posts and the collections that group them (`src/collections/` — `service.ts` for data access, `routes.ts` for handlers, `schemas.ts` for validation and cursor parsing). Two tables rather than one: `bookmarks` is "saved", `collection_items` is "filed in this folder". They are kept consistent in one direction — filing a post also inserts the bookmark, and un-saving deletes the post from every collection of that user — so `viewerHasBookmarked` is answerable from `bookmarks` alone. Removing a post from a collection leaves it saved; deleting a collection leaves its posts saved. Every enriched post response carries `viewerHasBookmarked`.

Collections are **private by default**. A private collection answers `404` (not `403`) to anyone but its owner, so probing ids can't confirm existence. Limits: 50 collections per user, 500 posts per collection, name ≤80 chars (trimmed, internal whitespace collapsed, unique per owner, case-sensitive), description ≤300.

| Endpoint | Auth | Contract |
|---|---|---|
| `GET /api/bookmarks` | JWT | `200 { items: [enriched], nextCursor }` — the viewer's saved posts, newest first; `cursor?`, `limit?` (clamped 20/50) |
| `PUT /api/posts/:id/bookmark` | JWT | `201` first time, `200` when already saved → `{ viewerHasBookmarked: true }` · `404` unknown post (FK P2003 mapped) |
| `DELETE /api/posts/:id/bookmark` | JWT | `200 { viewerHasBookmarked: false }` — also clears the post from all of the viewer's collections |
| `GET /api/collections` | optional | `200 { items: [collection] }`. No `userId` → the viewer's own (needs JWT, else `401`). `?userId=` → that user's **public** collections (all of them if it's the viewer). `?postId=` adds `containsPost` to each of the viewer's own collections — one round-trip for the "Save to…" picker |
| `POST /api/collections` | JWT | `{ name, description?, isPrivate? }` → `201` collection · `409` duplicate name (P2002 mapped) · `400` over the 50-collection cap |
| `GET /api/collections/:id` | optional | `200` collection · `404` unknown **or private and not yours** |
| `PATCH /api/collections/:id` | owner JWT | `{ name?, description?, isPrivate? }`, at least one field → `200` · `403` not owner · `409` duplicate name |
| `DELETE /api/collections/:id` | owner JWT | `204`; items cascade, bookmarks are deliberately kept |
| `GET /api/collections/:id/posts` | optional | `200 { items: [enriched], nextCursor }`, same privacy rule as the collection itself |
| `POST /api/collections/:id/posts` | owner JWT | `{ postId }` → `201` first time, `200` when already filed; body is the updated collection with `containsPost: true`. Also saves the post · `400` over the 500-item cap · `404` unknown post |
| `DELETE /api/collections/:id/posts/:postId` | owner JWT | `200` updated collection with `containsPost: false`; the bookmark survives |

Both listings are keyset-paged on `created_at DESC` using the composite primary key as the Prisma cursor, so the cursor payload is `{ afterPostId }`. `parseItemCursor()` rejects any other shape with `400` rather than handing Prisma a bad cursor and returning `500`. Unlike `sort=popular`, these rows don't re-order between pages, so paging is stable.

`/api/bookmarks` and `/api/collections` are top-level paths, so they are routed to post-service explicitly in `frontend/nginx.conf.template`, `frontend/vite.config.ts`, and `infra/k8s/40-ingress.yaml`.

### 3.3 API — internal (`src/internal.ts`)

| Endpoint | Caller | Contract |
|---|---|---|
| `GET /internal/posts/:id` | comment-service | `200 { id, authorId, title }` · `404` |
| `POST /internal/posts/:id/comment-count` | comment-service | `{ delta: 1 | -1 }` triggers an absolute snapshot refresh → `204`; missing post no-ops, dependency failures propagate |

### 3.4 Database — `post_db`

| Table | Columns | Constraints & indexes |
|---|---|---|
| `posts` | `id` uuid PK · `author_id` uuid · `title` text · `description` text · `tags` text[] · `file_id`/`file_name`/`file_mime` text NULL + `file_size` int NULL (**legacy, no longer written**) · `attachments` jsonb default `[]` · `upvote_count` int default 0 · `comment_count` int default 0 · `created_at` | INDEX(`author_id`) · INDEX(`created_at` DESC) · INDEX(`upvote_count` DESC, `created_at` DESC) · **GIN INDEX(`tags`)** |
| `post_reactions` | `post_id` uuid · `user_id` uuid · `created_at` | PK(`post_id`,`user_id`) · INDEX(`user_id`) · FK `post_id`→`posts.id` ON DELETE CASCADE |
| `interview_experiences` | `post_id` text · `company`/`role` varchar(120) · `stage`/`questions`/`difficulty`/`outcome` text | PK(`post_id`) · INDEX(`company`,`role`) · FK `post_id`→`posts.id` ON DELETE CASCADE |
| `bookmarks` | `post_id` uuid · `user_id` uuid · `created_at` | PK(`post_id`,`user_id`) · INDEX(`user_id`,`created_at` DESC) · FK `post_id`→`posts.id` ON DELETE CASCADE |
| `collections` | `id` uuid PK · `owner_id` uuid · `name` varchar(80) · `description` text default `''` · `is_private` bool default true · `item_count` int default 0 · `created_at` · `updated_at` | UNIQUE(`owner_id`,`name`) · INDEX(`owner_id`,`updated_at` DESC) |
| `collection_items` | `collection_id` uuid · `post_id` uuid · `created_at` | PK(`collection_id`,`post_id`) · INDEX(`collection_id`,`created_at` DESC) · INDEX(`post_id`) · FKs → `collections.id` / `posts.id`, both ON DELETE CASCADE |

The two composite indexes exactly match the two feed sort orders; the GIN index serves both `hasEvery` (multi-tag) and `has` (single-tag / q-as-tag) filters.

**Transactions:** upvote add/remove each run in `prisma.$transaction`: insert-or-skip the reaction row, and increment/decrement the counter **only if a row was actually created/deleted** — the counter provably cannot drift from the reaction rows, and double-taps are no-ops. `collections.item_count` follows the same insert-or-skip rule. Its one extra hazard is the cascade: deleting a post removes `collection_items` rows without touching the counter, so `DELETE /api/posts/:id` goes through `deletePostAndFixCounters()`, which reads the affected collections *before* the delete and decrements them in the same transaction.

**⚠️ Flags:**
- `q` search uses ILIKE `contains` on `title`/`description` — no trigram/FTS index, so it's a sequential scan at scale. Fine now; first search-scale fix is `pg_trgm` or `tsvector`.
- `popularTags()` is `SELECT unnest(tags), count(*) … GROUP BY` over **the whole table** — un-indexable, O(total posts), and called by the UI on every feed page load. The designated first caching target (measured ~4 ms at current row counts; grows linearly).
- Deleting a post cascades local children. Periodic comment cleanup and reference-aware file quarantine handle remote data through protected APIs.
- `comment_count` uses an absolute snapshot callback and periodic reconciliation; temporary drift heals during a full scan.

### 3.5 Inter-service communication

| Calls | When | Mode | If it's down |
|---|---|---|---|
| user `GET /internal/users/:id/following` | Following feed | sync, blocking | feed returns `502` — hard dependency, no fallback |
| user `POST /internal/profiles/batch` | every enriched response | sync, **degrading** | `.catch` → empty profile map → posts render with `author: null`; feed stays up |
| file `GET /internal/files/:id` | post creation, per attachment (parallel `Promise.all`) | sync, blocking | creation fails `502` (or `404` per missing file) — correct, since ownership can't be verified |

**Listens for:** the `comment-count` refresh callback (§3.3). See [Reliability](RELIABILITY.md) for repair jobs and Kafka delivery.

---

## 4 · file-service

`services/file` · port **4004** · database **file_db** + MinIO bucket **interviewhub-files** · the only blob-touching service

### 4.1 Purpose & responsibility

**Owns:** upload validation (size, MIME), blob storage in MinIO (S3 API), file metadata, and all three read modes (authenticated download, public inline content, internal ownership lookup).

**Why separate:** blob traffic has a completely different resource profile (memory buffers, streaming, body-size limits) from JSON APIs; isolating it means a flood of uploads can't starve feed serving, and it's the only service needing S3 credentials.

**Does not handle:** which post a file belongs to (post-service owns the association); image/video processing — **no thumbnailing, transcoding, or virus scanning exists**; clients render originals.

### 4.2 API

| Endpoint | Auth | Request | Success | Errors |
|---|---|---|---|---|
| `POST /api/files` | JWT | `multipart/form-data`, exactly one file under field **`file`**, ≤ 10 MB (`config.maxFileBytes`), MIME in allowlist | `201 { id, name, mime, sizeBytes }` | `400` no file field · `413` over limit (multer `LIMIT_FILE_SIZE` via shared handler) · `415` MIME not allowed |
| `GET /api/files/:id/download` | JWT | — | `200` stream, `content-disposition: attachment`, correct type/length | `404` |
| `GET /api/files/:id/content` | **none (public)** | — | `200` stream, `content-disposition: inline`, `cache-control: public, max-age=31536000, immutable` | `404` |
| `GET /internal/files/:id` | internal token | — | `200 { id, ownerId, name, mime, sizeBytes }` | `404` |

MIME allowlist (`src/config.ts`): `application/pdf`, `text/plain`, `text/markdown`, `application/msword`, `…wordprocessingml.document` (docx), `…spreadsheetml.sheet` (xlsx), `image/jpeg|png|gif|webp`, `video/mp4`, `video/quicktime`.

Filenames are sanitized (`[^\w.\- ]` → `_`, max 150 chars). Storage key: `{ownerId}/{randomUUID}/{sanitizedName}` — unguessable, collision-free, owner-prefixed. The `/content` route is deliberately unauthenticated so `<img>`/`<video>`/pdf.js can load media; possession of the UUID is the capability.

**⚠️ Flags:**
- The `415` error message still says “Allowed: PDF, txt, markdown, doc(x)” — **stale text**; the actual allowlist is broader (images, video, xlsx). Cosmetic, but it's a code-vs-message mismatch.
- Uploads buffer fully in memory (`multer.memoryStorage()`). At ≤10 MB × concurrent uploads this is bounded, but it's why the limit must stay modest.
- **No download authorization beyond auth:** any logged-in user can `/download` any file id, and anyone at all can `/content` it. Privacy model is "unguessable id", not ACLs.

### 4.3 Database & storage

| Table | Columns | Constraints & indexes |
|---|---|---|
| `files` | `id` uuid PK · `owner_id` uuid · `s3_key` text · `original_name` text · `mime` text · `size_bytes` int · `created_at` | UNIQUE(`s3_key`) · INDEX(`owner_id`) |

MinIO holds the bytes; Postgres holds the pointer + metadata. The bucket is created at startup if missing (`ensureBucket()` in `src/storage.ts`).

**Storage atomicity:** upload writes MinIO before metadata. A periodic worker removes aged blobs without metadata and quarantines unreferenced metadata before deleting bytes. There is no public file-delete endpoint.

### 4.4 Inter-service communication

Readiness checks Postgres and MinIO with a bounded response deadline. Cleanup calls post/user protected reference APIs, preserving files whenever either dependency is unavailable.

---

## 5 · comment-service

`services/comment` · port **4005** · database **comment_db** · threads, replies, comment upvotes — the most outbound-talkative service

### 5.1 Purpose & responsibility

**Owns:** threaded comments (adjacency list via nullable `parent_id`, assembled into a tree at read time by `src/tree.ts`) and comment upvotes.

**Does not handle:** the posts being commented on (verifies existence via post-service); notification delivery (emits events); author display data (batched from user-service at read time).

### 5.2 API

| Endpoint | Auth | Request | Success | Errors |
|---|---|---|---|---|
| `POST /api/comments/post/:postId` | JWT | `body` (1–5000) · `parentId?` (uuid) | `201 { …comment, viewerHasUpvoted: false, replies: [] }` | `400` parent belongs to another post · `404` post not found (bubbled from post-service) · `502` post-service down |
| `GET /api/comments/post/:postId` | optional | — | `200 { items: <tree>, total }` — tree nodes are comment rows + ISO `createdAt` + `author` (or null) + `viewerHasUpvoted` + nested `replies[]`, siblings ordered `createdAt asc` | — (unknown post ⇒ empty list, not 404) |
| `PUT /api/comments/:id/upvote` | JWT | — | `200 { upvoteCount, viewerHasUpvoted: true }` — idempotent, transactional (same pattern as posts) | `404` |
| `DELETE /api/comments/:id/upvote` | JWT | — | `200 { upvoteCount, viewerHasUpvoted: false }` | `404` |

**⚠️ No real pagination on threads:** the read is `take: 500`, ordered oldest-first, then tree-built in memory. Post #501's comment silently never renders. Nesting depth is unlimited. `buildTree` surfaces orphaned replies (deleted parent) as roots rather than dropping them — unit-tested behavior.

### 5.3 Database — `comment_db`

| Table | Columns | Constraints & indexes |
|---|---|---|
| `comments` | `id` uuid PK · `post_id` uuid · `author_id` uuid · `parent_id` uuid NULL · `body` text · `upvote_count` int default 0 · `created_at` | INDEX(`post_id`) · **self-FK** `parent_id`→`comments.id` ON DELETE CASCADE (deleting a comment deletes its whole subtree) |
| `comment_reactions` | `comment_id` uuid · `user_id` uuid · `created_at` | PK(`comment_id`,`user_id`) · FK→`comments.id` CASCADE |

No FK to `posts` — different database; `post_id` is an opaque reference. **Minor flag:** `comment_reactions` lacks the `INDEX(user_id)` that `post_reactions` has — the viewer-upvote lookup filters `user_id + comment_id IN (…)`, which the composite PK serves adequately, but the schemas are needlessly asymmetric.

**Transactions:** reactions and their counters commit together. Comment creation and its notification outbox event also share a transaction; count refresh remains a best-effort callback backed by reconciliation.

### 5.4 Inter-service communication

| Calls | When | Mode | If it's down |
|---|---|---|---|
| post `GET /internal/posts/:id` | before every comment insert | sync, blocking | commenting fails `502` — by design; can't validate or notify without the post |
| post `POST /internal/posts/:id/comment-count` `{delta:1}` | after insert | best-effort absolute snapshot refresh | periodic reconciliation repairs missed callbacks |
| Kafka notification event | after local comment + outbox commit | background relay | durable outbox retries until publish succeeds |
| user `POST /internal/profiles/batch` | thread reads | sync, **degrading** (`.catch` → authors null) | thread renders with anonymous authors |

Comment maintenance removes threads only after post-service confirms a missing post. Periodic snapshot repair restores post counts after lost callbacks.

### 5.5 Not implemented

No edit or delete endpoints for comments; no per-thread pagination; no mention/@-notifications.

---

## 6 · notification-service

`services/notification` · port **4006** · database **notification_db** · pure event sink + inbox

### 6.1 Purpose & responsibility

**Owns:** the in-app inbox — who should see what happened, whether they've read it, and the unread badge count.

**Why separate:** Kafka isolates inbox delivery from follow/comment actions, and transactional outboxes retain events while dependencies are unavailable.

**Does not handle:** email/push (in-app only, polled every 30 seconds). Kafka and producer outboxes provide durable event delivery.

### 6.2 API

| Endpoint | Auth | Request | Success | Errors |
|---|---|---|---|---|
| `GET /api/notifications` | JWT | query: `cursor?` · `limit?` (clamped **20/100** — the one endpoint with max 100) · `unreadOnly?` | `200 { items: [{ …notification, actor }], unreadCount, nextCursor }` — `actor` is `{ userId, username, displayName, school } \| null`; `unreadCount` is the total regardless of page | `400` bad cursor |
| `POST /api/notifications/:id/read` | JWT | — | `204` — scoped `updateMany({ id, recipientId: me })`, so you cannot read someone else's notification (silently no-ops) | — |
| `POST /api/notifications/read-all` | JWT | — | `204` | — |

Pagination: keyset on `createdAt` (`{ before: ISO }`), newest first.

**⚠️ Latent bug, flagged:** `unreadOnly` is parsed with `z.coerce.boolean()`, and `Boolean("false") === true` — so `?unreadOnly=false` behaves as *true*. Harmless today because the frontend never sends the param, but it's wrong as specified.

### 6.3 Database — `notification_db`

| Table | Columns | Constraints & indexes |
|---|---|---|
| `notifications` | `id` uuid PK · `recipient_id` uuid · `type` text (enum by convention, **not** a DB enum) · `actor_id` uuid · `post_id` uuid NULL · `comment_id` uuid NULL · `read` bool default false · `created_at` | INDEX(`recipient_id`,`created_at` DESC) — inbox page · INDEX(`recipient_id`,`read`) — badge count |

Both hot queries are pure index scans. No FKs anywhere (all four ids reference other services' databases). Actor names are **not** denormalized — resolved per-read via the user-service batch (one call per page, not per row).

### 6.4 Inter-service communication

**Calls:** user `POST /internal/profiles/batch` on inbox reads — sync, degrading (`.catch` → `actor: null`).

**Listens for:** Kafka events from user-service and comment-service, persisted idempotently by unique event ID. Malformed messages go to a DLQ; persistence/DLQ failure leaves the source offset uncommitted.

---

## 7 · Cross-cutting summary

**Who calls whom** (rows → columns; *(d)* = degrades gracefully, *(f&f)* = fire-and-forget, otherwise blocking):

| | user | post | file | notification |
|---|---|---|---|---|
| **auth** | create profile (rollback on fail) | — | — | — |
| **user** | — | — | — | new_follower *(outbox → Kafka)* |
| **post** | following ids · profile batch *(d)* | — | ownership check | — |
| **comment** | profile batch *(d)* | post lookup · count snapshot *(f&f)* | — | new_comment / new_reply *(outbox → Kafka)* |
| **notification** | profile batch *(d)* | — | — | — |

**Remaining gaps:** user-search N+1 (≤61 queries) · comment threads capped at 500 with no pagination · `unreadOnly=false` coercion bug · stale 415 message in file-service · account deletion doesn't exist.

## Personal preparation (user-service)

Preparation plans, checklist tasks, and interview schedules are private user-service data. All endpoints below start with `/api/users/me/preparation` and require a JWT. Every operation checks the authenticated owner, returning 404 for absent or foreign records. Existing `/api/users` gateway routing covers these endpoints; internal routes remain inaccessible through the gateway.

| Endpoint | Behavior |
|---|---|
| `GET /summary` | `{ planCount, totalTasks, completedTasks, nextInterview }` across all the owner's plans |
| `GET /plans` · `POST /plans` | List / create plans: name (1–120), optional company/role (≤120), nullable collectionId |
| `GET /plans/:planId` · `PATCH /plans/:planId` · `DELETE /plans/:planId` | Read / edit / delete a plan; deletion cascades tasks and interviews, never the collection |
| `GET /plans/:planId/tasks` · `POST /plans/:planId/tasks` | List / create tasks: title (1–300), nullable dueDate (`YYYY-MM-DD`), completed (boolean) |
| `PATCH /plans/:planId/tasks/:taskId` · `DELETE /plans/:planId/tasks/:taskId` | Edit, explicitly complete/reopen, or delete a task |
| `GET /plans/:planId/interviews` · `POST /plans/:planId/interviews` | List / create interviews: stage, scheduledAt (ISO instant with timezone), notes (≤5000), status |
| `PATCH /plans/:planId/interviews/:interviewId` · `DELETE /plans/:planId/interviews/:interviewId` | Reschedule, change status/notes/stage, or delete |
| `GET /interviews?view=upcoming|past` | Upcoming defaults to future scheduled interviews; past includes elapsed scheduled interviews and all completed/cancelled interviews |

Lists return `{ items, nextCursor }`, accept cursor/limit (default 20, max 50), and order ascending by createdAt (plans/tasks) or scheduledAt (interviews), then ID. Plan DTOs include totalTasks and completedTasks across the entire checklist. PATCH accepts partial create fields. Interview stages match public experience stages; statuses are scheduled/completed/cancelled. Interview instants are UTC, displayed and entered in the browser timezone. Task deadlines are timezone-independent calendar dates.

Tables: `preparation_plans` (owner and createdAt/ID index), `preparation_tasks` (plan and createdAt/ID index), `preparation_interviews` (plan and scheduledAt/ID index; status and scheduledAt/ID index). Child tables have local cascading foreign keys. Collection IDs are opaque cross-service references, never database joins.

When a new collection is linked, user-service calls protected post-service `GET /internal/collections/:id` returning `{ id, ownerId }`. Another owner's collection returns 404 to the caller. Set `POST_SERVICE_URL` in user-service configuration (already supplied by Compose and Kubernetes). Only changed non-null collection links require post-service availability; task/interview writes, unlinks, and unrelated plan updates remain independent. Deleted collection references may remain until the owner replaces/unlinks them; the UI resolves current collection labels through `/api/collections` and displays missing references as unavailable.

Migration: `services/user/prisma/migrations/4_preparation`. Apply with `npx prisma migrate deploy --schema services/user/prisma/schema.prisma` using the user database configuration, then run `npm run generate`. Container startup applies versioned migrations automatically.

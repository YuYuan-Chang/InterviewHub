# CLAUDE.md — user-service

Port 4002 · database `user_db` · owns profiles **and the follow graph**. Read the root `CLAUDE.md` for shared conventions, and `README.md` for why the follow graph lives here rather than in its own service.

`app.ts` mounts three routers in order: `profilesRouter` → `followsRouter` → `internalRouter`. Beyond the standard five files:

- **`src/profiles.ts`** — public profile routes.
- **`src/follows/service.ts`** — the *only* place that touches the `Follow` model. This is the seam for extracting a social-graph service later, so route handlers must go through it rather than calling `prisma.follow` directly.
- **`src/follows/routes.ts`** — follow/unfollow + follower/following lists.
- **`src/internal.ts`** — `/internal/*`, the contract three other services depend on.
- **`src/events.ts`** — the Kafka notification producer.

## The internal contract other services build on

- **`/internal/profiles/batch`** caps at 200 ids and returns exactly `{ userId, username, displayName, school, avatarFileId }`. Post-, comment-, and notification-service all enrich against that shape — narrowing the `select` breaks three services at once.
- **`/internal/users/:userId/following`** returns ids from `followingIds(userId, cap = 1000)`. Post-service feeds those straight into an `authorId IN (...)` filter, so the cap bounds a query it doesn't control.
- **`/internal/profiles`** is what auth-service calls during registration; its 409 is what becomes "username already taken" upstream.

## Follow semantics

`follow()` is `createMany` + `skipDuplicates` and returns whether a new edge was created. That boolean drives two things: the response status (201 new, 200 already following) and whether `new_follower` is published. Publishing on a repeat follow would spam notifications. Publishing is fail-open (`publish()` never throws), so a dead broker must not turn a successful follow into an error.

Follower/following lists are keyset-paginated on `follows.created_at DESC` via `encodeCursor({ before })`, then hydrated with **one** batched `profile.findMany`. Keep that two-step shape.

## Known hot spot

`withCounts()` runs two `count` queries plus an `isFollowing` lookup **per profile**, and `/api/users/search` maps it over up to 20 rows — roughly 60 queries for one search. It works and is not urgent, but don't make it worse: extending search or any profile list means batching with grouped counts, not adding another per-profile call.

## Gotchas

- `avatarFileId` is validated before the update — file-service `/internal/files/:id` must report the caller as `ownerId` and an `image/*` mime. Passing `null` clears the avatar, which is why the zod field is `.nullable().optional()`.
- Search matches username, displayName and school with `contains` + `mode: 'insensitive'`; there is no index behind it.
- Migrations are at `1_avatar`, so the next one is `2_<name>`.

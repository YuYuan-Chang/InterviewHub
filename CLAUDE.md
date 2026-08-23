# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

InterviewHub is a microservices exercise: six Express 5 + Prisma services, a React SPA, npm workspaces, Docker Compose for dev and k8s manifests for kind. **`README.md` documents the architecture and the reasoning behind each design decision** (why the follow graph lives in user-service, why reactions aren't a service, fan-out-on-read, saga-lite registration). Read it before proposing structural changes — most "why is it like this" questions are answered there. This file covers what the README doesn't: the working conventions and the things that break.

## Commands

Bootstrap a fresh clone — **Prisma clients are gitignored, so nothing typechecks until you generate them**:

```bash
npm ci && npm run generate && npm run build
```

| Task | Command |
|---|---|
| Generate Prisma clients (after clone or any `schema.prisma` edit) | `npm run generate` |
| Build everything (shared first, then services + frontend typecheck) | `npm run build` |
| Rebuild just shared after editing it | `npm run build:shared` |
| All unit tests (vitest, fans out across workspaces) | `npm test` |
| One workspace's tests | `npm test -w @interviewhub/shared` |
| One test file | `npx vitest run packages/shared/test/auth.test.ts` |
| One test by name | `npx vitest run -t "rejects expired tokens"` |
| End-to-end smoke (needs the compose stack up) | `npm run smoke` |
| Seed demo data (idempotent, re-runnable) | `npm run seed` |

Full stack: `./scripts/generate-keys.sh` once, then `cd infra && docker compose up -d --build` → app on :8080, services on :4001-4006.

Fast loop for a single service — deps in Docker, service on the host:

```bash
cd infra && docker compose up -d postgres minio kafka
npm run dev -w @interviewhub/post-service   # tsx watch
```

`.claude/launch.json` defines all seven dev servers by name, so `preview_start` with `{name: "post-service"}` (or `"frontend"`, :5173) works directly.

## Service anatomy

Every service is the same five files, and the shape is load-bearing:

- **`index.ts`** — calls `initTracing()` **first**, then `await import('./app')`. The dynamic import is deliberate: OTel auto-instrumentation must patch express/undici before they load. Converting these to static imports silently breaks tracing.
- **`app.ts`** — `buildApp()` composes shared middleware in a fixed order: `requestContext()` → `requestLogging()` → `installMetrics()` → `express.json()` → `healthRoutes()` → routes → `notFoundHandler` → `errorHandler()`.
- **`config.ts`** — the only place `process.env` is read, via `requiredEnv`/`envOr`/`decodeB64Env` from shared. PEM keys travel base64-encoded.
- **`db.ts`** — the Prisma singleton.
- **`routes.ts`** — zod schema + `Router`.

## packages/shared is the contract

Every cross-cutting concern lives here; reach for it before writing your own. Services consume it from `dist/`, so **edits require `npm run build:shared` before dependents see them**.

- **Auth** — `requireAuth(publicKey)` / `optionalAuth()` / `authedUser(req)` for user JWTs; `requireInternal(token)` for `/internal/*`. Verification is local RS256 against a public key in config — never add an auth round-trip.
- **Validation** — `validateBody(schema)`, `parseQuery(schema, req.query)`, and `param(req, 'id')`. Use `param()`, not `req.params.id`: Express 5 types params as `string | string[]`.
- **Errors** — `throw new HttpError(status, message)` and let `errorHandler` serialize it. Don't hand-roll error responses.
- **S2S** — `s2sClient(baseUrl, token)` for `/internal/*` calls. It maps downstream failures to 404/409/**502**, so a peer's 500 never leaks as your own. `fireAndForget(promise, label, logger)` for side effects that must not fail the request.
- **Pagination** — `clampLimit` (default 20, max 50) + `encodeCursor`/`decodeCursor` for keyset paging.
- **Context** — `getRequestId()` reads an `AsyncLocalStorage` request id that `s2sClient` forwards on every hop, so one user action is greppable across all six services.
- **Events** — Kafka publisher/consumer, topic names, and the zod event schema.

## Boundaries that must not be crossed

- **One database per service, separate credentials.** No cross-service joins are possible by construction. To render another service's data, batch-fetch it over `/internal/*` — see `services/post/src/enrich.ts` (`enrichPosts` fetches author profiles + viewer reactions) as the pattern to copy.
- **`/internal/*` is network-internal.** Shared-secret header via `requireInternal`, and deliberately not routed by nginx or the Ingress. Never expose one through the gateway.
- **Prisma clients are generated to `services/<svc>/generated/prisma`**, not `node_modules/@prisma/client`. Import types from `'../generated/prisma'`.
- **Schema changes need a versioned migration** in `services/<svc>/prisma/migrations/` (existing ones follow `N_name`, e.g. `1_avatar`); containers run `prisma migrate deploy` at boot. Don't reintroduce `db push`.

## Events and counters

Notifications go through Kafka (`interviewhub.notifications`): comment-service and user-service publish, notification-service consumes. Publishing is **fail-open — `publish()` never throws**, so a dead broker can't break a user action. The consumer is at-least-once with a DLQ for unparseable messages, so inserts should tolerate redelivery.

`kafkajs` is lazily `require`d inside `shared/src/events.ts` for the same reason `index.ts` dynamic-imports the app: a static import loads it before `initTracing()` and OTel can't patch it.

Upvote and comment counts are denormalized columns kept in sync inside `$transaction` blocks alongside the reaction row — see the upvote handlers in post/comment routes. Comment-count bumps cross services over REST via `fireAndForget`, not Kafka: that's synchronous counter state, not an event.

## Frontend

React 18 + Vite + react-query. All HTTP goes through `frontend/src/api.ts`, which holds tokens in `localStorage` and transparently retries once through `/api/auth/refresh` on a 401 — add endpoints there rather than calling `fetch` from components. Vite proxies `/api/*` to the services in dev; nginx does it in compose and k8s.

## Gotchas

- `npm run dev -w @interviewhub/<svc>` loads **both** `infra/.env` (created by `./scripts/generate-keys.sh`) and a per-service `services/<svc>/.env` holding just a host-side `DATABASE_URL`. Both are gitignored; a missing one fails the start with ENOENT.
- CI (`.github/workflows/ci.yml`) runs generate → build → `npm test`, then boots the full compose stack and runs the smoke test against the real gateway. A change that passes unit tests can still fail e2e.
- `scripts/smoke-test.mjs` and `scripts/seed.mjs` are plain `.mjs` hitting the public API through the gateway — no Prisma, no imports from the workspaces. Keep them dependency-free.

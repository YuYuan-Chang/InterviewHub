# InterviewHub

A social platform where students share interview prep materials — resumes, notes, PDFs — and get feedback from peers.

Think "Reddit for interview prep": you follow people, post your interview writeups with a PDF attached, and others upvote and comment in threads. It's a working app, but it's built as a **microservices reference project**: six independent Node/TypeScript services, a React SPA, Docker Compose for the dev loop, and full Kubernetes manifests (probes, HPA, Ingress) for a local kind cluster.

**If you're evaluating the project**, read [Architecture](#architecture) and [Why it's built this way](#why-its-built-this-way) — every structural choice is written down with its trade-off.
**If you're here to run or change code**, jump to [Quick start](#quick-start) and [Daily development](#daily-development).

---

## Table of contents

- [Quick start](#quick-start) · [What you can do in the app](#what-you-can-do-in-the-app)
- [Architecture](#architecture) · [How a request actually flows](#how-a-request-actually-flows) · [Why it's built this way](#why-its-built-this-way)
- [Repo layout](#repo-layout) · [Anatomy of a service](#anatomy-of-a-service) · [The shared package](#the-shared-package) · [Public API](#public-api)
- [Daily development](#daily-development) · [Tests and CI](#tests-and-ci) · [Troubleshooting](#troubleshooting)
- [Kubernetes](#kubernetes-kind) · [Observability](#observability) · [Messaging (Kafka)](#messaging-kafka) · [Operations](#operations)
- [Known gaps](#known-gaps) · [Further reading](#further-reading)

---

## Quick start

**Prerequisites:** Docker (with Compose), Node 20+ (CI uses 22), `openssl`, and about 3GB of free disk for images.

```bash
git clone <this repo> && cd Interview_Hub

./scripts/generate-keys.sh            # RS256 keypair + infra/.env — run once
cd infra && docker compose up -d --build
```

First build takes a few minutes. When it settles:

```bash
open http://localhost:8080            # the app

node scripts/seed.mjs                 # 10 demo users, 28 posts, threaded comments
node scripts/smoke-test.mjs           # end-to-end check through the gateway
```

Log in as **`mchen@example.com` / `password123`** — every seeded user shares that password. The seed is idempotent, so re-running it is safe.

| What | Where |
|---|---|
| App (nginx gateway + SPA) | http://localhost:8080 |
| Services, for direct `curl` | http://localhost:4001 … :4006 |
| Postgres | `localhost:5433` (note: **5433**, not 5432) |
| MinIO console | http://localhost:9001 — `minioadmin` / `minioadmin` |
| Jaeger (traces) | http://localhost:16686 |
| Prometheus | http://localhost:9090 |
| Grafana (pre-provisioned dashboard) | http://localhost:3001 |

Tear down with `docker compose down` (add `-v` to also drop the database and file volumes).

### Working on the code instead of just running it

Prisma clients are **generated, not committed**, so a fresh clone does not typecheck until you generate them:

```bash
npm ci && npm run generate && npm run build
```

Run that once after cloning, and re-run `npm run generate` after any `schema.prisma` edit.

---

## What you can do in the app

- **Accounts & profiles** — register/login with JWT auth (RS256); profile carries school, target roles, bio, avatar
- **Follow system** — follow/unfollow, with follower/following counts and lists
- **File sharing** — PDF/notes uploads up to 10MB, with title, description, and tags (role, topic, company)
- **Feeds** — *Following* (people you follow) and *Explore* (everything), sortable by recent/popular, filterable by tag
- **Comments & Q&A** — threaded replies; post authors are notified of comments, users of new followers
- **Resume reviews** — choose Resume review when posting, paste plain text or Markdown, and optionally attach a PDF. Peers propose edits with a diff preview or import a `.patch`/`.diff`; the owner accepts or rejects proposals. Download the current text and each unified patch. Version checks prevent stale proposals overwriting accepted changes. Attachments stay as originally uploaded.
- **Reactions** — upvotes on both posts and comments
- **Search** — one search bar covering posts (title/description/tags, via `?q=` on the explore feed) and people (username/name/school, via `/api/users/search`)
- **Filters** — multi-tag filtering (`?tags=a,b`, AND semantics) with a chip bar fed by `/api/posts/tags/popular`
- **Structured interview experiences** — choose “Interview experience” when creating a post to share company, role, stage, questions asked, difficulty, and outcome. Browse experiences using company/role/stage/difficulty/outcome filters; search also matches company, role, and question text. Attachments, comments, and upvotes work as usual.

### Interview experience API

`POST /api/posts` accepts `type: "experience"` and a required `interviewExperience` object:

```json
{
  "title": "My backend engineering interview",
  "type": "experience",
  "description": "Practicing aloud helped me explain my trade-offs.",
  "interviewExperience": {
    "company": "Example Corp",
    "role": "Backend engineer",
    "stage": "technical",
    "questions": "Design an LRU cache.\nHow would you test concurrent access?",
    "difficulty": "hard",
    "outcome": "pending"
  }
}
```

Stages: `recruiter_screen`, `online_assessment`, `technical`, `system_design`, `behavioral`, `onsite`, `other`. Difficulty: `easy`, `medium`, `hard`. Outcomes: `offer`, `rejected`, `pending`, `withdrew`, `prefer_not_to_say`. Company and role are trimmed, required, and limited to 120 characters; questions are trimmed, required, and limited to 5,000 characters.

Both feeds accept `type=experience|material`, `company`, `role`, `stage`, `difficulty`, and `outcome`, combined with existing tags, sort, and pagination. Company/role filters use case-insensitive substring matching. Post responses include `type` and `interviewExperience` (null for materials). Existing clients can omit `type` to create materials. Interview details are stored in a related table and deleted with their post.

The additive `1_interview_experiences` migration runs automatically when updated Compose/Kubernetes post-service containers start. For local development, apply it with `npx prisma migrate deploy --schema services/post/prisma/schema.prisma` using the post database configuration, then regenerate the client with `npm run prisma:generate -w @interviewhub/post-service`.

---

## Architecture

```
                        ┌──────────────────────────────┐
   browser ── SPA ──────│  gateway (nginx / Ingress)   │
                        └──┬────┬────┬────┬────┬────┬──┘
                /api/auth  │    │    │    │    │    │  /api/notifications
                     ┌─────┘    │    │    │    │    └─────┐
                 ┌───▼───┐ ┌────▼──┐ ┌──▼───┐ ┌▼─────┐ ┌──▼─────────┐
                 │ auth  │ │ user  │ │ post │ │ file │ │notification│   + comment
                 │ 4001  │ │ 4002  │ │ 4003 │ │ 4004 │ │   4006     │     4005
                 └───┬───┘ └──┬────┘ └──┬───┘ └──┬───┘ └────┬───────┘
                     │        │         │        │          │
                  auth_db  user_db   post_db  file_db+MinIO notification_db
                                                            ▲
                              user ─┐                       │
                           comment ─┴─► Kafka: interviewhub.notifications
```

The gateway is the only thing the browser talks to. It routes by path prefix — `/api/auth` → auth-service, `/api/users` → user-service, and so on — and serves the SPA for everything else. In dev, Vite's proxy mirrors the same table (`frontend/vite.config.ts`); in Compose and k8s, nginx does it (`frontend/nginx.conf.template`).

| Service | Port | Owns | Calls (REST, `/internal/*`) |
|---|---|---|---|
| **auth** | 4001 | credentials, JWT issuance, refresh tokens | user (create profile on register) |
| **user** | 4002 | profiles **+ follow graph** | — (publishes new-follower events to Kafka) |
| **post** | 4003 | posts, tags, post upvotes, both feeds | user (following ids, author profiles), file (verify attachment) |
| **file** | 4004 | uploads/downloads, 10MB + MIME enforcement, MinIO | — |
| **comment** | 4005 | threads, comment upvotes | post (exists/author, comment counter), user (author profiles) |
| **notification** | 4006 | in-app notifications | user (actor profiles) — consumes Kafka |

Two rules define every boundary in the system:

1. **One database per service, with separate credentials.** A service physically cannot join across another service's tables — it isn't a convention, it's enforced by Postgres grants (`infra/docker/postgres-init/01-create-databases.sql`). To render another service's data, batch-fetch it over `/internal/*`.
2. **`/internal/*` is network-internal.** Protected by a shared-secret header (`requireInternal`) *and* deliberately not routed by nginx or the Ingress. Never expose one through the gateway.

## How a request actually flows

Two walkthroughs that cover most of the interesting machinery.

**Loading your Following feed** (`GET /api/posts/feed/following`)

1. nginx routes it to **post-service**, which verifies the JWT **locally** with the public key from its config — no round-trip to auth-service.
2. post-service calls **user-service** `GET /internal/users/:id/following` to get the ids of everyone you follow.
3. It queries its own `post_db` for `author_id IN (...)`, keyset-paginated by cursor (never `OFFSET`).
4. `enrich.ts` batch-fetches author profiles from user-service (`POST /internal/profiles/batch`) and stitches in the viewer's own upvote state — one round-trip per concern, not per post.
5. Every hop carries the same `x-request-id`, so the whole thing is one greppable trace in the logs and one span waterfall in Jaeger.

**Posting a comment** (`POST /api/comments/post/:postId`)

1. **comment-service** verifies the JWT locally, validates the body with zod, and writes the comment.
2. In the same `$transaction` it bumps the thread's denormalized counters.
3. It calls post-service `POST /internal/posts/:id/comment-count` via `fireAndForget` — synchronous counter state, so REST, not an event. If post-service is down, the comment still succeeds and the failure is logged.
4. It publishes a `new_comment` event to Kafka. **Publishing never throws**: a dead broker cannot break the user's action.
5. **notification-service** consumes the event and inserts the notification row. If it was down, the event waits in the topic and arrives on recovery.

## Why it's built this way

Every one of these is a trade-off, not a law. The alternative and the tipping point are named.

- **JWT verification is local.** auth-service holds the RS256 private key and is the only thing that can *mint* identity; every other service verifies with the public key from config. Nothing is on auth-service's critical path, so it can be down and reads still work. Cost: revocation isn't instant — a token is valid until it expires (1h default).
- **One Postgres instance, one database per service.** Real isolation without running six Postgres pods on a laptop. In production these become six separate instances; nothing in the code changes, only `DATABASE_URL`.
- **Reactions are not a service.** An upvote is a row plus a denormalized counter on its target, kept in sync inside a `$transaction`. So post upvotes live in post-service and comment upvotes in comment-service. A reactions service would turn one transactional write into a distributed one, buying nothing.
- **Notifications go through Kafka.** Comment and follow actions publish events; notification-service consumes them. Producers are fail-open and consumption is at-least-once — see [Messaging](#messaging-kafka) for the full guarantees. This replaced an earlier fire-and-forget HTTP path, which silently lost notifications whenever the consumer was down.
- **The Following feed is fan-out-on-read**: post-service fetches your followee ids and queries `author_id IN (...)` at request time. Simple and always fresh. At real scale you'd flip to fan-out-on-write with a precomputed timeline — the seam is `services/post/src/feed.ts`.
- **Registration is a saga-lite**: auth creates the credential row → calls user-service to create the profile → rolls the credential row back if that fails (e.g. username taken). No distributed transaction, no orphaned accounts.
- **`packages/shared` is the contract.** Auth, validation, errors, S2S, pagination, request context, and events live in exactly one place, so six services behave identically without a framework.

### Does the follow graph deserve its own service?

We kept it **inside user-service**, as its own module (`services/user/src/follows/`):

- Follow edges reference the same user aggregate profiles do, and the most common read — a profile page — needs profile + counts + is-following *together*. Splitting them turns every profile render into a cross-service join.
- At this scale the graph is one indexed `follows(follower_id, followee_id)` table; there's no independent scaling pressure.

A dedicated **social-graph service** earns its keep when: (1) the graph outgrows relational storage and wants Redis adjacency sets or a graph DB; (2) feed generation moves to fan-out-on-write and the graph becomes a hot path with different caching needs than profile CRUD; (3) more edge types appear (blocks, mutes, groups). Because all follow logic sits behind one module with its own routes and data access, extracting it later is mechanical: lift the module, point the routes at a new deployment, move the table.

---

## Repo layout

```
packages/shared/        auth, validation, errors, S2S client, pagination, context, events, health
services/
  auth/  user/  post/  file/  comment/  notification/     Express 5 + zod + Prisma each
    src/                the service (see "Anatomy of a service" below)
    prisma/             schema.prisma + versioned migrations
    test/               vitest, *.test.ts
frontend/               React 18 + Vite SPA; components/ and pages/
  api.ts                every HTTP call in the app goes through here
  nginx.conf.template   the gateway: path routing + SPA fallback
infra/
  compose.yaml          dev stack: postgres, minio, kafka, 6 services, frontend, observability
  k8s/                  namespace, config, secrets, statefulsets, deployments+HPA, ingress
  observability/        prometheus config, grafana provisioning + dashboard
scripts/                generate-keys.sh, seed.mjs, smoke-test.mjs, baseline-migrations.sh
docs/SERVICES.md        route-by-route, table-by-table reference for all six services
```

## Anatomy of a service

All six services are the same five files, and the shape is load-bearing:

| File | Role |
|---|---|
| `index.ts` | Calls `initTracing()` **first**, then `await import('./app')`. The dynamic import is deliberate — OTel auto-instrumentation must patch express/undici before they load. Converting this to a static import silently breaks tracing. |
| `app.ts` | `buildApp()` composes shared middleware in a fixed order: `requestContext()` → `requestLogging()` → `installMetrics()` → `express.json()` → `healthRoutes()` → routes → `notFoundHandler` → `errorHandler()`. |
| `config.ts` | The **only** place `process.env` is read, via `requiredEnv`/`envOr`/`decodeB64Env`. PEM keys travel base64-encoded. |
| `db.ts` | The Prisma singleton. |
| `routes.ts` | zod schema + `Router`. |

Prisma clients are generated to `services/<svc>/generated/prisma` (not `node_modules/@prisma/client`), so import types from `'../generated/prisma'`.

## The shared package

Reach for `packages/shared` before writing your own version of any of these. Services consume it from `dist/`, so **edits require `npm run build:shared` before dependents see them**.

| Concern | What to use |
|---|---|
| **Auth** | `requireAuth(publicKey)` / `optionalAuth()` / `authedUser(req)` for user JWTs; `requireInternal(token)` for `/internal/*`. Verification is local RS256 — never add an auth round-trip. |
| **Validation** | `validateBody(schema)`, `parseQuery(schema, req.query)`, and `param(req, 'id')`. Use `param()`, not `req.params.id` — Express 5 types params as `string \| string[]`. |
| **Errors** | `throw new HttpError(status, message)` and let `errorHandler` serialize it. Don't hand-roll error responses. |
| **Service-to-service** | `s2sClient(baseUrl, token)`. It maps a downstream failure to 404/409/**502**, so a peer's 500 never leaks as your own. `fireAndForget(promise, label, logger)` for side effects that must not fail the request. |
| **Pagination** | `clampLimit` (default 20, max 50) + `encodeCursor`/`decodeCursor` for keyset paging. |
| **Request context** | `getRequestId()` reads an `AsyncLocalStorage` request id that `s2sClient` forwards on every hop — one user action is greppable across all six services. |
| **Events** | Kafka publisher/consumer, topic names, and the zod event schema. |

## Public API

Everything below is reachable through the gateway. `/internal/*` routes are not — they're listed in [`docs/SERVICES.md`](docs/SERVICES.md) along with request/response shapes, validation rules, error codes, and every database table.

| Service | Endpoints |
|---|---|
| **auth** | `POST /api/auth/register` · `login` · `refresh` · `logout` · `token` — `GET /api/auth/me` |
| **user** | `GET /api/users/me` · `by-id/:userId` · `by-username/:username` · `search` — `PATCH /api/users/me` — `POST\|DELETE /api/users/:userId/follow` — `GET /api/users/:userId/followers` · `following` |
| **post** | `POST /api/posts` — `GET /api/posts/:id` · `feed/explore` · `feed/following` · `tags/popular` — `PUT\|DELETE /api/posts/:id/upvote` — `DELETE /api/posts/:id` |
| **file** | `POST /api/files` — `GET /api/files/:id/content` · `:id/download` |
| **comment** | `GET\|POST /api/comments/post/:postId` — `PUT\|DELETE /api/comments/:id/upvote` |
| **notification** | `GET /api/notifications` — `POST /api/notifications/:id/read` · `read-all` |

Every service also exposes `GET /livez` (process up) and `GET /healthz` (checks its DB), plus `/metrics`.

---

## Daily development

| Task | Command |
|---|---|
| Generate Prisma clients (after clone or a `schema.prisma` edit) | `npm run generate` |
| Build everything (shared first, then services + frontend typecheck) | `npm run build` |
| Rebuild just shared after editing it | `npm run build:shared` |
| All unit tests | `npm test` |
| One workspace's tests | `npm test -w @interviewhub/shared` |
| One test file | `npx vitest run packages/shared/test/auth.test.ts` |
| One test by name | `npx vitest run -t "rejects expired tokens"` |
| End-to-end smoke (needs the stack up) | `npm run smoke` |
| Seed demo data (idempotent) | `npm run seed` |

### Fast loop: one service on the host, deps in Docker

Editing a single service in Docker means a rebuild per change. Instead, run its dependencies in Compose and the service itself under `tsx watch`:

```bash
cd infra && docker compose up -d postgres minio kafka
npm run dev -w @interviewhub/post-service     # tsx watch, one terminal per service
npm run dev -w @interviewhub/frontend         # Vite on :5173, proxies /api/* to :400x
```

`npm run dev` loads **two** env files: `infra/.env` (written by `generate-keys.sh`) and a per-service `services/<svc>/.env` holding just a host-side `DATABASE_URL`. Both are gitignored, and a missing one fails the start with `ENOENT`. Compose publishes Postgres on **5433**, so the per-service file looks like:

```bash
# services/post/.env
DATABASE_URL=postgresql://post_svc:post_pw@localhost:5433/post_db
```

Credentials for each service's database are in `infra/docker/postgres-init/01-create-databases.sql`.

`.claude/launch.json` defines all seven dev servers by name, so `preview_start` with `{name: "post-service"}` (or `"frontend"`) works directly.

### Adding things

- **A new endpoint** — zod schema + handler in the service's `routes.ts`; add the call to `frontend/src/api.ts` rather than calling `fetch` from a component (it holds tokens in `localStorage` and transparently retries once through `/api/auth/refresh` on a 401).
- **A schema change** — edit `schema.prisma`, add a versioned migration under `services/<svc>/prisma/migrations/` following the existing `N_name` convention (e.g. `1_avatar`), then `npm run generate`. Containers run `prisma migrate deploy` at boot. Don't reintroduce `db push`.
- **Data owned by another service** — batch-fetch it over `/internal/*`. `services/post/src/enrich.ts` is the pattern to copy.

## Tests and CI

```bash
npm test          # unit tests: JWT middleware, cursors, comment threading, request-id propagation
npm run smoke     # full end-to-end flow through the gateway (needs the compose stack up)
```

`.github/workflows/ci.yml` runs on every push and PR in two jobs: generate → build → `npm test`, then a second job that boots the whole Compose stack, waits for all six `/healthz` endpoints, and runs the smoke test against the real gateway. **A change that passes unit tests can still fail e2e** — if you touched persistence, messaging, or anything cross-service, run `npm run smoke` locally first.

`scripts/smoke-test.mjs` and `scripts/seed.mjs` are plain `.mjs` hitting the public API — no Prisma, no imports from the workspaces. Keep them dependency-free.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| TypeScript errors about missing `../generated/prisma` on a fresh clone | Prisma clients are gitignored. Run `npm run generate`. |
| A service can't see your change to `packages/shared` | Services import shared from `dist/`. Run `npm run build:shared`. |
| `npm run dev -w …` fails with `ENOENT` on an env file | Missing `infra/.env` (run `./scripts/generate-keys.sh`) or a missing `services/<svc>/.env` — see [Fast loop](#fast-loop-one-service-on-the-host-deps-in-docker). |
| Host-run service can't reach Postgres | Compose publishes it on **5433**, but service configs default to 5432. Set `DATABASE_URL` in the per-service `.env`. |
| Tracing suddenly stopped working | Something converted `index.ts`'s `await import('./app')` into a static import, or added a static `kafkajs` import. Both load libraries before OTel can patch them. |
| Notifications don't appear for a host-run service | Kafka isn't published to the host (it advertises `kafka:9092` inside the Compose network). Publishes fail open, so the user action still succeeds — run those services in Compose to see notifications. |
| Uploads over ~10MB | Expected: file-service enforces a 10MB limit and returns `413`. The gateway allows 12MB precisely so that clean error can be returned instead of a truncated connection. |

---

## Kubernetes (kind)

Requires `kind`, `kubectl`, and Docker.

```bash
./scripts/generate-keys.sh
./infra/k8s/kind-setup.sh           # cluster + ingress-nginx + metrics-server + app
open http://localhost:8081
BASE_URL=http://localhost:8081 node scripts/smoke-test.mjs

kubectl get pods -n interviewhub    # 2 replicas each; Ready = probes passing
kubectl get hpa  -n interviewhub    # CPU-based autoscaling, 2→5 replicas
```

Every service ships liveness (`/livez`) and readiness (`/healthz`, which checks its DB) probes, resource requests/limits, and an `autoscaling/v2` HPA at 70% CPU. Uploads work through the Ingress via the `proxy-body-size: 12m` annotation. Postgres, MinIO, and Kafka run as single-replica StatefulSets for the dev cluster — swap for managed services in production.

## Observability

Every service emits structured JSON logs (pino), Prometheus metrics, and OpenTelemetry traces.

- **Correlation IDs** — each request gets an `x-request-id` (adopted from the gateway or minted) carried through every service-to-service hop via `AsyncLocalStorage`. Every log line includes it, so one user action is traceable across all six services.
- **Jaeger** (http://localhost:16686) — distributed traces. Open a `GET /api/posts/feed/following` trace to watch the post-service → user-service fan-out as a span waterfall.
- **Prometheus** (http://localhost:9090) — scrapes `/metrics` on every service: request-duration histograms labeled by route, plus process metrics.
- **Grafana** (http://localhost:3001) — pre-provisioned "InterviewHub Services" dashboard: request rate, p95 latency, and 5xx rate per service. Anonymous admin access, no login.

On Kubernetes the pods carry `prometheus.io/*` scrape annotations (bring your own cluster Prometheus); tracing no-ops unless `OTEL_EXPORTER_OTLP_ENDPOINT` is set.

## Messaging (Kafka)

Notifications flow through **Kafka**: comment-service and user-service publish `new_comment` / `new_reply` / `new_follower` events to the `interviewhub.notifications` topic (single-node KRaft broker, no ZooKeeper); notification-service consumes them (`groupId: notification-service`) and writes rows.

- **Durable** — if notification-service is down, events wait in the topic and are delivered on recovery. Under the old HTTP path they were silently lost.
- **At-least-once** — a failing insert (say, DB down) leaves the offset uncommitted and the message is redelivered. Duplicates are possible, losses are not, so inserts must tolerate redelivery.
- **Fail-open producers** — `publish()` never throws. A dead broker can't break a user action, which is why Kafka here is strictly an upgrade over the HTTP path.
- **DLQ** — unparseable messages go to `interviewhub.notifications.dlq` instead of wedging a partition.
- **Keyed by recipient** for per-recipient ordering. Events carry the `x-request-id`, and OTel's kafkajs instrumentation stitches producer → consumer into one trace.
- **The comment-count bump stays REST** — that's synchronous counter state, not an event.
- `kafkajs` is lazily `require`d inside `shared/src/events.ts`, for the same reason `index.ts` dynamic-imports the app: a static import loads it before `initTracing()` and OTel can't patch it.
- **Next rigor step** (not implemented): the **transactional outbox** pattern, which would make the DB write and the publish atomic.

## Operations

- **Graceful shutdown** — services drain in-flight requests on SIGTERM, disconnect Prisma, flush traces, then exit. k8s pods add a `preStop` sleep so endpoint removal propagates first, and rolling deploys drop zero requests.
- **Migrations** — schema changes are versioned `prisma migrate` files (`services/*/prisma/migrations/`). Containers run `prisma migrate deploy` at boot (Compose) or in an initContainer (k8s). Databases created by the old `db push` flow are adopted once via `./scripts/baseline-migrations.sh`.
- **Secrets** — `generate-keys.sh` writes `infra/keys/` and `infra/.env`, both gitignored. For k8s, `infra/k8s/create-secrets.sh` builds the Secret from those keys; `02-secrets.example.yaml` is a template, never a real secret.

## Known gaps

Stated plainly, because a reference project should be honest about what it doesn't do:

- **No timeouts or retries on service-to-service calls.** A *hung* (rather than dead) dependency stalls the caller until the socket timeout. First thing to add for production.
- **No rate limiting anywhere**, including `POST /api/auth/login` — there's no brute-force protection yet.
- **No account deletion.** Deleting an auth user cascades its refresh tokens, but nothing removes the profile, posts, or comments.
- **No transactional outbox**, so a crash between DB commit and Kafka publish loses the event.

## Further reading

- [`docs/SERVICES.md`](docs/SERVICES.md) — route-by-route, table-by-table reference for all six services, generated from the code as-built, with file paths cited.
- [`AGENTS.md`](AGENTS.md) — contribution conventions: code style, testing expectations, commit and PR guidelines.
- [`CLAUDE.md`](CLAUDE.md) — the same working conventions, formatted for AI coding assistants.

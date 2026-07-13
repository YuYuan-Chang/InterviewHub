# InterviewHub

A social platform where students share interview prep materials (resumes, notes, PDFs) and get feedback from peers — built as a **microservices** exercise: six Node/TypeScript services, a React SPA, Docker Compose for the dev loop, and full Kubernetes manifests (probes, HPA, Ingress) for a local kind cluster.

## Features

- **Accounts & profiles** — JWT auth (RS256), profiles with school, target roles, bio
- **Follow system** — follow/unfollow, follower/following counts and lists
- **File sharing** — PDF/notes uploads up to 10MB with title, description, tags (role, topic, company)
- **Feeds** — *Following* (people you follow) and *Explore* (everything), sortable by recent/popular, filterable by tag
- **Comments & Q&A** — threaded replies; authors are notified of comments, users of new followers
- **Reactions** — upvotes on posts and comments
- **Search** — one search bar for posts (title/description/tags, via `?q=` on the explore feed) and people (username/name/school, via `/api/users/search`)
- **Filters** — multi-tag filtering (`?tags=a,b`, AND semantics) with a chip bar fed by `/api/posts/tags/popular`

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
```

| Service | Owns | Talks to (REST, `/internal/*`) |
|---|---|---|
| **auth** (4001) | credentials, JWT issuance, refresh tokens | user (create profile on register) |
| **user** (4002) | profiles **+ follow graph** | notification (new follower) |
| **post** (4003) | posts, tags, post upvotes, both feeds | user (following ids, author profiles), file (verify attachment) |
| **file** (4004) | uploads/downloads, 10MB + MIME enforcement, MinIO | — |
| **comment** (4005) | threads, comment upvotes | post (exists/author, comment counter), notification, user |
| **notification** (4006) | in-app notifications | user (actor profiles) |

Design decisions worth knowing:

- **JWT verification is local.** auth-service signs with an RS256 private key; every other service verifies with the public key from config. No auth round-trip per request.
- **`/internal/*` endpoints** are protected by a shared-secret header and are *not* routed by the gateway/Ingress — they're reachable only inside the network.
- **One Postgres instance, one database per service** with separate credentials. A service physically cannot join across another service's tables — the boundary is enforced, without running six Postgres pods locally.
- **Reactions are not a service.** An upvote is a row plus a denormalized counter on its target, so post upvotes live in post-service and comment upvotes in comment-service.
- **Notifications are fire-and-forget.** Comment/follow actions POST to notification-service and log (not fail) if it's down. The production upgrade is a message queue (RabbitMQ/SQS) — same seam, different transport.
- **Following feed is fan-out-on-read**: post-service fetches your followee ids from user-service and queries `author_id IN (...)`. At real scale you'd flip to fan-out-on-write with a precomputed timeline.
- **Registration is a saga-lite**: auth creates credentials → calls user-service to create the profile → rolls back the credential row if that fails (e.g. username taken).

### Does the follow graph deserve its own service?

We kept it **inside user-service** (as its own module, `services/user/src/follows/`):

- Follow edges reference the same user aggregate profiles do, and the most common read — a profile page — needs profile + counts + is-following *together*. Splitting them turns every profile render into a cross-service join.
- At this scale the graph is one indexed `follows(follower_id, followee_id)` table; there's no independent scaling pressure.

A dedicated **social-graph service** earns its keep when: (1) the graph outgrows relational storage and wants Redis adjacency sets or a graph DB; (2) feed generation moves to fan-out-on-write and the graph becomes a hot path with different scaling/caching needs than profile CRUD; (3) more edge types appear (blocks, mutes, groups). Because all follow logic sits behind one module with its own routes/repo, extracting it later is mechanical: lift the module, point the routes at a new deployment, move the table.

## Repo layout

```
packages/shared/       JWT middleware, validation, S2S client, health routes, cursors
services/{auth,user,post,file,comment,notification}/   Express 5 + zod + Prisma each
frontend/              React 18 + Vite SPA, served by nginx (which proxies /api/*)
infra/compose.yaml     dev stack: postgres, minio, 6 services, frontend
infra/k8s/             namespace, config, secrets, statefulsets, deployments+HPA, ingress
scripts/               generate-keys.sh, smoke-test.mjs, seed.mjs
```

## Run it (Docker Compose)

```bash
./scripts/generate-keys.sh          # RS256 keypair + infra/.env (once)
cd infra && docker compose up -d --build
open http://localhost:8080          # the app

node scripts/smoke-test.mjs         # end-to-end test through the gateway
node scripts/seed.mjs               # demo users/posts (mchen@example.com / password123)
```

MinIO console: http://localhost:9001 (minioadmin/minioadmin). Service ports 4001-4006 are also mapped for direct curl.

## Run it (Kubernetes / kind)

Requires `kind`, `kubectl`, and Docker.

```bash
./scripts/generate-keys.sh
./infra/k8s/kind-setup.sh           # cluster + ingress-nginx + metrics-server + app
open http://localhost:8081
BASE_URL=http://localhost:8081 node scripts/smoke-test.mjs

kubectl get pods -n interviewhub    # 2 replicas each, Ready = probes passing
kubectl get hpa  -n interviewhub    # CPU-based autoscaling, 2→5 replicas
```

Every service ships liveness (`/livez`) and readiness (`/healthz`, checks its DB) probes, resource requests/limits, and an `autoscaling/v2` HPA at 70% CPU. Uploads work through the Ingress via the `proxy-body-size: 12m` annotation. Postgres and MinIO run as single-replica StatefulSets for the dev cluster — swap for managed services in production.

## Local development (fast loop)

```bash
cd infra && docker compose up -d postgres minio   # just the stateful deps
set -a && source infra/.env && set +a
npm run dev -w @interviewhub/auth-service          # tsx watch, one terminal per service
npm run dev -w @interviewhub/frontend              # Vite on :5173 proxies /api/* to :400x
```

## Tests

```bash
npm test          # unit tests (JWT middleware, cursors, comment threading, request-id propagation)
npm run smoke     # full end-to-end flow (needs the compose stack up)
```

CI (`.github/workflows/ci.yml`) runs both on every push/PR: typecheck + build + unit tests, then the full compose stack with the smoke test against the real gateway.

## Observability

Every service emits structured JSON logs (pino), Prometheus metrics, and OpenTelemetry traces:

- **Correlation IDs** — each request gets an `x-request-id` (adopted from the gateway or minted) carried through every service-to-service hop via `AsyncLocalStorage`; every log line includes it, so one user action is traceable across all six services.
- **Jaeger** (http://localhost:16686) — distributed traces; open a `GET /api/posts/feed/following` trace to see the post-service → user-service fan-out as a span waterfall.
- **Prometheus** (http://localhost:9090) — scrapes `/metrics` on every service (request-duration histograms labeled by route, process metrics).
- **Grafana** (http://localhost:3001) — pre-provisioned "InterviewHub Services" dashboard: request rate, p95 latency, and 5xx rate per service.

On Kubernetes the pods carry `prometheus.io/*` scrape annotations (bring your own cluster Prometheus); tracing no-ops unless `OTEL_EXPORTER_OTLP_ENDPOINT` is set.

## Messaging (Kafka)

Notifications flow through **Kafka** instead of fire-and-forget HTTP: comment-service and user-service publish `new_comment`/`new_reply`/`new_follower` events to the `interviewhub.notifications` topic (single-node KRaft broker, no ZooKeeper); notification-service consumes them (`groupId: notification-service`) and writes rows.

- **Durable**: if notification-service is down, events wait in the topic and are delivered on recovery — under the old HTTP path they were silently lost.
- **At-least-once**: a failing insert (e.g. DB down) leaves the offset uncommitted and the message is redelivered; duplicates are possible, losses are not.
- **Fail-open producers**: a dead broker never breaks the user action — publish errors are logged and dropped (same guarantee as before, so Kafka is strictly an upgrade).
- **DLQ**: unparseable messages go to `interviewhub.notifications.dlq` instead of wedging a partition.
- **Keyed by recipient** for per-recipient ordering; events carry the `x-request-id`, and OTel's kafkajs instrumentation stitches producer → consumer into one trace.
- The comment-count bump stays REST — it's synchronous counter state, not an event.
- Next rigor step (not implemented): the **transactional outbox** pattern, which would make the DB write and the publish atomic.

## Operations notes

- **Graceful shutdown** — services drain in-flight requests on SIGTERM, disconnect Prisma, flush traces, then exit; k8s pods add a `preStop` sleep so endpoint removal propagates first. Rolling deploys drop zero requests.
- **Migrations** — schema changes are versioned `prisma migrate` files (`services/*/prisma/migrations/`). Containers run `prisma migrate deploy` at boot (compose) or in an initContainer (k8s). Databases created by the old `db push` flow are adopted once via `./scripts/baseline-migrations.sh`.

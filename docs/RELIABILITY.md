# Production reliability

Each service owns its data, workers and rate-limit buckets. Internal repair and reference APIs remain behind `requireInternal` and are never routed by the gateway. All schema changes use additive, versioned Prisma migrations.

## Request protection

Every `/api/*` request consumes a PostgreSQL-backed bucket: 300 requests per IP per minute **per service**, shared by all replicas. Auth also limits registration to 5 attempts/IP/15 minutes and login to 20 attempts/IP/15 minutes plus 10 attempts/normalized email/15 minutes. Failed and successful attempts both count. Exhaustion returns `429`, `Retry-After`, `RateLimit-Limit` and `RateLimit-Remaining`; database failure returns `503` rather than bypassing protection. Health, metrics and internal routes are exempt. Expired buckets are pruned in batches of 10,000 every minute.

`API_RATE_LIMIT`, `REGISTER_RATE_LIMIT`, `LOGIN_IP_RATE_LIMIT` and `LOGIN_ACCOUNT_RATE_LIMIT` override the counts; windows remain fixed. For local bulk seeding, explicitly raise the registration allowance in the auth container environment, then restore it. Limits must be positive integers. Fixed windows permit a boundary burst, and account limits can temporarily lock out an account targeted by an attacker; these are deliberate trade-offs of this implementation.

Express ignores forwarded headers by default. Set `TRUST_PROXY` to a comma-separated list of **trusted proxy IPs/CIDRs**. Compose trusts private/local network ranges for its local demo, and its nginx gateway overwrites `X-Forwarded-For` with the actual peer address. Kubernetes defaults to no trust: configure the ingress controller's actual source CIDR and restrict direct backend access with network policy before serving production traffic. Never set blanket proxy trust on an internet-accessible backend. Without trusted proxy configuration, requests through the same proxy share one IP bucket.

## Service-to-service isolation

`packages/shared/src/s2s.ts` imposes a 3-second total deadline covering connection, response body and retry delays. Only GET retries (up to twice, exponential jitter); POST and DELETE are never automatically retried because the downstream transaction may already have committed. Retries cover transport failures and HTTP 408/429/502/503/504. Missing resources and conflicts preserve 404/409; other failures map to 502.

Each client instance opens its circuit after five failed logical calls. It fails fast for ten seconds, then allows a single half-open probe. A successful response closes it. Settings are injectable through `s2sClient` options. This is a per-client deadline, not an end-to-end request budget. Registration remains a compensating saga: an ambiguous timeout after profile commit can leave an orphan profile; completing that saga needs a durable registration workflow.

## Durable notifications

Follow edges and comment rows now commit their notification event into an `outbox` table in the **same local transaction**. A broker outage does not fail the user action. A database failure rolls back both domain write and event. Each event has a stable UUID and originating request ID.

Each producer runs a one-second relay with batches of 50. It deletes a row only after Kafka confirms the publish. Failure retains the row with exponential backoff capped at five minutes. Multiple relays may publish duplicates; a crash between Kafka acknowledgement and outbox deletion also causes replay. Delivery is therefore **at least once**, with no strict application-level ordering guarantee across relay replicas or retries.

Notification inserts use a unique `event_id` and `createMany(skipDuplicates)`, so replay cannot create another inbox row or reset read state. Legacy Kafka records without IDs receive a stable `topic:partition:offset` identity. Existing inbox rows retain null IDs; replaying records already handled before this migration may create one additional row because those old rows cannot be correlated reliably. Malformed records go to the DLQ; a failed DLQ publish propagates and does not acknowledge the source record. Self-notifications are suppressed.

Deploy migrations first, then the notification consumer, then user/comment producers. Keep the notification uniqueness records for as long as events can be replayed. Outbox rows are removed after publication; pending rows are never discarded automatically. Kafka retention, replication and backups still need production configuration (the supplied Compose broker is a single-node demo).

## Counter repair and deleted posts

Post and comment services run bounded, keyset-scanned maintenance every 60 seconds (`MAINTENANCE_INTERVAL_MS`). Each tick handles up to 100 source rows. Post reactions, comment reactions and collection item counts are recomputed from local source rows in serializable transactions. Serialization conflicts are logged and retried on the next tick. Follow counts are already computed directly from edge rows and need no repair.

Comment counts are absolute snapshots fetched from protected `GET /internal/comments/post/:id/count`. Post-service locks the post row while fetching and setting the count, serializing callbacks and repair workers. The existing `POST /internal/posts/:id/comment-count` callback remains compatible with `{ delta: 1 | -1 }`, but triggers this snapshot refresh instead of applying the delta. Lost callbacks heal during the next full scan; writes concurrent with a snapshot can be briefly absent until the next callback/scan.

Comment-service checks post existence through the protected API and removes comments/reactions only on an authoritative 404. Timeouts, invalid responses and 5xx do not authorize deletion. This recurring scan also catches comments committed concurrently with post deletion. Post-owned reactions, bookmarks, revisions, experiences and collection items retain their database cascades. Notifications remain historical inbox records.

## File garbage collection and readiness

File-service checks references through `GET /internal/file-references/:id` in post-service (legacy and JSON attachments) and user-service (avatars). It never reads another service's database. All reference checks must succeed with a valid boolean response before collection can proceed.

A file must be at least one day old before it is considered. An unreferenced file is first quarantined with `gc_marked_at`; internal ownership verification refuses quarantined files, preventing new ordinary attachment/avatar flows. Public content remains readable during quarantine. After **another full day**, the worker rechecks references, deletes MinIO bytes, then deletes metadata. References committed during quarantine restore the file. Per-file database locks serialize GC replicas. The minimum grace cannot be reduced below a day; `FILE_GC_GRACE_MS` can increase it. This assumes attachment writes do not remain suspended across the full quarantine interval; it is a conservative delayed-collection protocol, not a distributed transaction.

The same worker pages through MinIO objects (100 per tick) and removes aged objects with no metadata, including crashes between object upload and metadata insertion. A failed object delete retains metadata for retry. Shared attachments and avatars are retained until no owner references them. Workers restart scans from the beginning after process restart.

`/healthz` now checks both Postgres and `HeadBucket` on the configured bucket. The MinIO request aborts after two seconds, and readiness itself has a 2.5-second response deadline. `/livez` remains dependency-independent. Workers log completion counts and failures and drain active runs on shutdown; the existing process shutdown deadline still bounds termination.

## Operations and verification

Monitor structured `job completed` / `job failed; will retry` logs. Alert on repeated job failures, sustained 502/circuit-open responses, and oldest outbox age. Run these queries **against each owning database**:

```sql
-- user_db and comment_db
SELECT count(*) AS pending, min(created_at) AS oldest, max(attempts) AS max_attempts FROM outbox;
-- file_db
SELECT count(*), min(gc_marked_at) FROM files WHERE gc_marked_at IS NOT NULL;
```

Run `npm run generate`, `npm run build`, `npm test`, and `BASE_URL=http://localhost:8080 npm run smoke` against an updated stack. `scripts/reliability-test.mjs` adds Kafka outage/recovery, duplicate delivery, counter repair, orphan cleanup, deleted-post cleanup, MinIO readiness and login rate-limit checks. It requires a **disposable** Compose project whose name ends in `-reliability`; it pauses dependencies and changes fixture rows. Provide `RELIABILITY_PROJECT`, `BASE_URL` and `FILE_URL`. Never run it against production or a valuable development database. Use a 1-second maintenance interval in this test stack; the assertions wait up to a minute. Apply all migrations and wait for Kafka readiness before starting the suites.

Reproduce the isolated checks (the override uses temporary memory storage and separate ports):

```bash
docker compose -p interviewhub-reliability -f infra/compose.yaml -f infra/compose.reliability.yaml up -d --build frontend
# Wait for all /healthz endpoints and the Kafka healthcheck to pass.
BASE_URL=http://localhost:18080 npm run smoke
RELIABILITY_PROJECT=interviewhub-reliability node scripts/reliability-test.mjs
docker compose -p interviewhub-reliability -f infra/compose.yaml -f infra/compose.reliability.yaml down -v
```

The fault suite resets test auth buckets, creates its own users, and restores paused dependencies in `finally`. It leaves fixture rows until the disposable stack is removed. Test storage is lost whenever its dependency containers are stopped. The usual smoke suite consumes three registration attempts; repeated smoke runs within 15 minutes require a fresh test stack or resetting only the disposable database's rate buckets.

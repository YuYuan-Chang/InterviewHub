# CLAUDE.md — file-service

Port 4004 · database `file_db` (metadata) + MinIO/S3 (bytes) · the only service that touches object storage. Post-service stores a verified copy of the metadata; it never stores bytes. Read the root `CLAUDE.md` for shared conventions.

Beyond the standard five files: **`src/storage.ts`** — the S3 client and every bucket/object operation.

## Storage setup

`ensureBucket()` runs in `index.ts` *before* `listen()`, so the service provisions its own bucket at boot and a fresh MinIO needs no manual step. `forcePathStyle: true` is required for MinIO and any non-AWS endpoint — removing it breaks local dev.

Object keys are `${ownerId}/${randomUUID()}/${sanitizedName}` and are entirely server-controlled. `sanitizeName()` strips everything outside `\w . - space` and caps at 150 chars. Treat the client filename as display metadata only — never as a key or a path.

## Limits

`maxFileBytes` is 10MB, hard-coded in `config.ts` as a product requirement, and enforced by Multer (`memoryStorage`, `files: 1`). The gateway sets `client_max_body_size 12m` specifically so an oversized upload gets a clean 413 from this service instead of an opaque nginx error — the two numbers are related, so change them together.

`ALLOWED_MIME_TYPES` in `config.ts` is the allowlist: documents, images (rendered as inline tiles), and videos (played inline). A miss is a 415. Adding a type usually means the frontend needs to know how to render it.

## Three read paths, three different auth models

| Route | Auth | Notes |
|---|---|---|
| `/api/files/:id/download` | `requireAuth` | `attachment` disposition, streams |
| `/api/files/:id/content` | **none** | `inline`, immutable cache header |
| `/internal/files/:id` | `requireInternal` | ownership check for post- and user-service |

`/content` is deliberately unauthenticated: `<img>` and `<video>` can't send an Authorization header, so inline media relies on file ids being unguessable UUIDs. Don't "fix" that by adding auth without also rewriting every media tile in the frontend.

Note that neither `/download` nor `/content` checks ownership — any authenticated user can download any file id, which is what makes post attachments readable by other users. If you tighten that, it's a cross-service change, not a local one.

## Streaming

Uploads buffer in memory (fine at ≤10MB, and it keeps the container stateless); downloads **stream** via `getObjectStream().pipe(res)` with an explicit `error` handler that destroys the response. Keep downloads streaming and keep that handler — without it a mid-stream S3 failure hangs the client.

Content-type and content-length come from the stored metadata, not from the object, so metadata and object writes must not drift: a failed `putObject` must never leave a row claiming a successful upload.

Only `0_init` exists under `prisma/migrations/`. Local runs need Postgres **and** MinIO up (`docker compose up -d postgres minio`).

# File Service Guidelines

## Scope and Structure

This service exclusively owns file metadata and MinIO/S3 object storage. Upload, download, content, and internal metadata routes live in `src/routes.ts`; bucket and object operations belong in `src/storage.ts`; storage limits, MIME allowlists, and connection settings live in `src/config.ts`. Post-service stores only verified attachment metadata, never file bytes.

Follow `../../AGENTS.md`. Do not add outbound dependencies on other service databases. Keep `/internal/files/:id` protected with `requireInternal`, and keep user-facing authorization separate from public inline-content behavior.

## Development and Verification

- `npm run prisma:generate -w @interviewhub/file-service` regenerates Prisma types.
- `npm run build -w @interviewhub/file-service` compiles and type-checks.
- `npm run dev -w @interviewhub/file-service` starts port 4004 in watch mode.
- `npm test -w @interviewhub/file-service` runs its Vitest suite.

Local execution needs Postgres and MinIO plus generated env files. Run the root `npm run smoke` for upload, download, attachment, or storage configuration changes.

## Implementation Rules

Enforce the configured size limit and MIME allowlist before persistence. Treat client filenames as display metadata, not object keys or filesystem paths; generated storage keys must remain server-controlled. Stream downloads when possible rather than buffering large objects. Preserve accurate `Content-Type` and safe `Content-Disposition` headers.

Coordinate database metadata and object writes carefully: failures must not report a successful upload with missing content. Map Multer size failures through the shared error handler. Keep environment access in `src/config.ts`, use structured logging, and preserve tracing-first startup in `src/index.ts`.

## Tests and Schema Changes

Add tests under `test/*.test.ts` for authentication, ownership, missing objects, disallowed MIME types, maximum size, and storage failures. Mock S3 in unit tests; exercise real MinIO through the smoke suite. Commit numbered Prisma migrations for metadata changes and never commit `.env`, credentials, buckets, or uploaded fixtures containing sensitive data.

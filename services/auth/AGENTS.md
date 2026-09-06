# Auth Service Guidelines

## Scope and Structure

This service owns credentials, RS256 access-token issuance, and rotating refresh tokens. It must not own profile data or make authorization decisions for other domains. `src/routes.ts` defines the public API, `src/tokens.ts` handles token creation and hashing, `src/config.ts` is the only environment boundary, and `prisma/` contains the auth database schema and migrations.

Follow the repository-wide conventions in `../../AGENTS.md`. Keep `src/index.ts` tracing initialization before the dynamic import of `app.ts`; changing that order silently disables instrumentation.

## Development and Verification

- `npm run prisma:generate -w @interviewhub/auth-service` regenerates the local Prisma client.
- `npm run build -w @interviewhub/auth-service` type-checks and compiles the service.
- `npm run dev -w @interviewhub/auth-service` runs port 4001 with `tsx watch` and the repository env files.
- `npm test -w @interviewhub/auth-service` runs its Vitest suite.

The shared package is consumed from `dist/`; run `npm run build:shared` after changing shared auth or error helpers. For registration or token-flow changes, also run the root `npm run smoke` against the Compose stack.

## Implementation Rules

Validate request bodies with zod and `validateBody`; raise `HttpError` instead of sending ad hoc error shapes. Keep login errors indistinguishable for unknown emails and bad passwords. Pin JWT signing and verification to RS256, store only hashes of refresh tokens, and preserve single-use refresh-token rotation.

Registration creates credentials and then calls user-service to create a profile. Preserve the compensating credential delete when profile creation fails. Use `s2sClient` for that internal call and never expose signing keys outside this service.

## Tests and Schema Changes

Place tests in `test/*.test.ts` and use Vitest with behavior-oriented cases such as expired tokens, refresh reuse, duplicate email, and downstream profile failure. Mock service boundaries in unit tests; use the smoke suite for the real registration flow. Commit a numbered migration for schema changes and never use `prisma db push` as a replacement.

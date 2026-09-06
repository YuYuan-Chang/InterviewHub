# CLAUDE.md — auth-service

Port 4001 · database `auth_db` · owns credentials and tokens, and nothing else. This is the only service that holds the JWT **private** key; every other service verifies RS256 locally against the public key. Read the root `CLAUDE.md` for the conventions every service shares.

Beyond the standard five files: **`src/tokens.ts`** — signing, hashing, and the token pair. All crypto lives there.

## Token rules that are load-bearing

- Access tokens are RS256 with `subject = userId` and an `email` claim, TTL from `ACCESS_TOKEN_TTL` (default `1h`). Downstream services call `requireAuth(publicKey)` and never call back here — adding a validation round-trip defeats the design.
- Refresh tokens are 48 random bytes; the database stores only the SHA-256 hash (`refresh_tokens.token_hash`, unique). Never persist the raw token.
- `/api/auth/refresh` is **single-use rotation**: the stored row is deleted before a new pair is issued, and that user's expired rows are pruned through `fireAndForget`. Reusing a refresh token must stay a 401.
- Login returns the same 401 for an unknown email and a wrong password. Don't add a "no such account" branch.
- `/api/auth/token` re-issues an access token from a still-valid one; it exists for tests and tooling.

## Registration is the saga

`POST /api/auth/register` creates the credential row, then calls user-service `/internal/profiles` over `s2sClient`. If that call fails, the credential row is **deleted** to compensate, and a downstream 409 is remapped to "This username is already taken". Email collisions surface earlier as Prisma `P2002` → 409.

Any change to this handler must keep the compensating delete. Without it, a failed signup leaves a login with no profile — and the user can authenticate but 404s on every profile route.

## Gotchas

- Keys arrive base64-encoded (`JWT_PRIVATE_KEY_B64` / `JWT_PUBLIC_KEY_B64`, read via `decodeB64Env`). `./scripts/generate-keys.sh` writes them into `infra/.env`.
- `INTERNAL_TOKEN` is `requiredEnv`, so the service won't boot without it even though only registration uses it.
- Emails are lowercased both on insert and on lookup — keep the two in sync or logins silently miss.
- The bcrypt hash (cost 10) is computed before the uniqueness check, so duplicate-email requests still pay for it.

Only `0_init` exists under `prisma/migrations/`; a schema change here needs `1_<name>`.

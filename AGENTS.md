# Repository Guidelines

## Project Structure & Module Organization

InterviewHub is an npm-workspaces TypeScript monorepo. Shared middleware and cross-cutting utilities live in `packages/shared/src/`. Six Express/Prisma services are under `services/{auth,user,post,file,comment,notification}`; each keeps code in `src/`, migrations in `prisma/`, and tests in `test/`. The React/Vite client is in `frontend/src/`, with UI in `components/` and views in `pages/`. Infrastructure lives in `infra/`; repository-wide utilities are in `scripts/`.

Preserve service ownership: do not query another service's database. Use protected `/internal/*` APIs and shared helpers instead. Read `README.md` and `docs/SERVICES.md` before changing architectural boundaries.

## Build, Test, and Development Commands

- `npm ci && npm run generate`: install locked dependencies and generate all Prisma clients. Re-run generation after editing a `schema.prisma`.
- `npm run build`: build and type-check all workspaces.
- `npm test`: run all Vitest suites.
- `npm run dev -w @interviewhub/post-service`: run one service with `tsx watch`.
- `npm run dev -w @interviewhub/frontend`: start Vite on port 5173.
- `./scripts/generate-keys.sh && docker compose -f infra/compose.yaml up -d --build`: start the complete local stack.
- `npm run smoke`: exercise the running stack through its public gateway.

## Coding Style & Naming Conventions

Use strict TypeScript, two-space indentation, single quotes, semicolons, and trailing commas. Use `camelCase` for variables/functions, `PascalCase` for components and types, and lowercase descriptive filenames such as `routes.ts`. Keep environment access in each service's `config.ts`. Reuse shared validation, error, auth, and service-to-service helpers. Preserve dynamic app imports in service `index.ts` files because tracing depends on import order.

## Testing Guidelines

Vitest is the unit-test framework. Place tests in a workspace's `test/` directory and name them `*.test.ts`; use behavior-focused test names. Run one file with `npx vitest run services/comment/test/tree.test.ts`. Add unit coverage for changed logic and run `npm run smoke` for persistence, messaging, or cross-service changes. No numeric coverage threshold is enforced.

## Commit & Pull Request Guidelines

History uses short, imperative, sentence-case subjects such as `Fix PDF previews in frontend`. Keep commits focused. Pull requests should summarize behavior, list verification commands, link issues, and include screenshots for UI changes. Commit versioned Prisma migrations (`N_description`); never replace them with `db push`. Ensure generation, build, tests, and applicable smoke checks pass before review.

## Security & Configuration

Never commit `.env`, `infra/.env`, generated keys, credentials, or generated Prisma clients. Keep `/internal/*` endpoints behind `requireInternal` and out of gateway routes. Use example secret manifests only as templates.

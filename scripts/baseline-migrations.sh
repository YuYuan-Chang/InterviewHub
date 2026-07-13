#!/usr/bin/env bash
# One-time baseline: marks the 0_init migration as already applied on databases
# that were created by the old `prisma db push` flow (preserves all data).
# Run with the compose postgres up: ./scripts/baseline-migrations.sh
set -euo pipefail
cd "$(dirname "$0")/.."

PG_HOST=${PG_HOST:-localhost}
PG_PORT=${PG_PORT:-5433}

for svc in auth user post file comment notification; do
  url="postgresql://${svc}_svc:${svc}_pw@${PG_HOST}:${PG_PORT}/${svc}_db"
  echo "--- baselining $svc ($url)"
  (cd "services/$svc" && DATABASE_URL="$url" npx prisma migrate resolve --applied 0_init) \
    || echo "    (already baselined or DB unreachable — check output above)"
done
echo "Done. 'prisma migrate deploy' will now no-op on these databases."

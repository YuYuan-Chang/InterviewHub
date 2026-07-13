#!/usr/bin/env bash
# Creates the interviewhub-secrets Secret from infra/keys (run scripts/generate-keys.sh first).
set -euo pipefail
cd "$(dirname "$0")/../.."

if [[ ! -f infra/keys/jwt_private.pem ]]; then
  echo "Run scripts/generate-keys.sh first." >&2
  exit 1
fi

PRIV_B64=$(base64 < infra/keys/jwt_private.pem | tr -d '\n')
PUB_B64=$(base64 < infra/keys/jwt_public.pem | tr -d '\n')
INTERNAL_TOKEN=$(grep '^INTERNAL_TOKEN=' infra/.env | cut -d= -f2)

kubectl create secret generic interviewhub-secrets \
  --namespace interviewhub \
  --from-literal=JWT_PRIVATE_KEY_B64="$PRIV_B64" \
  --from-literal=JWT_PUBLIC_KEY_B64="$PUB_B64" \
  --from-literal=INTERNAL_TOKEN="$INTERNAL_TOKEN" \
  --from-literal=S3_ACCESS_KEY=minioadmin \
  --from-literal=S3_SECRET_KEY=minioadmin \
  --from-literal=AUTH_DATABASE_URL="postgresql://auth_svc:auth_pw@postgres:5432/auth_db" \
  --from-literal=USER_DATABASE_URL="postgresql://user_svc:user_pw@postgres:5432/user_db" \
  --from-literal=POST_DATABASE_URL="postgresql://post_svc:post_pw@postgres:5432/post_db" \
  --from-literal=FILE_DATABASE_URL="postgresql://file_svc:file_pw@postgres:5432/file_db" \
  --from-literal=COMMENT_DATABASE_URL="postgresql://comment_svc:comment_pw@postgres:5432/comment_db" \
  --from-literal=NOTIFICATION_DATABASE_URL="postgresql://notification_svc:notification_pw@postgres:5432/notification_db" \
  --dry-run=client -o yaml | kubectl apply -f -

echo "Secret interviewhub-secrets applied."

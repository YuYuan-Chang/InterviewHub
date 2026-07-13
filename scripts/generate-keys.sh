#!/usr/bin/env bash
# Generates the RS256 keypair used to sign/verify JWTs and writes:
#   infra/keys/jwt_private.pem, infra/keys/jwt_public.pem  (used by k8s secret script)
#   infra/.env                                             (used by docker compose)
set -euo pipefail
cd "$(dirname "$0")/.."

mkdir -p infra/keys
if [[ -f infra/keys/jwt_private.pem ]]; then
  echo "infra/keys/jwt_private.pem already exists — reusing."
else
  openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out infra/keys/jwt_private.pem
  openssl pkey -in infra/keys/jwt_private.pem -pubout -out infra/keys/jwt_public.pem
  echo "Generated new RS256 keypair in infra/keys/"
fi

PRIV_B64=$(base64 < infra/keys/jwt_private.pem | tr -d '\n')
PUB_B64=$(base64 < infra/keys/jwt_public.pem | tr -d '\n')
INTERNAL_TOKEN=${INTERNAL_TOKEN:-$(openssl rand -hex 24)}

cat > infra/.env <<EOF
JWT_PRIVATE_KEY_B64=${PRIV_B64}
JWT_PUBLIC_KEY_B64=${PUB_B64}
INTERNAL_TOKEN=${INTERNAL_TOKEN}
EOF
echo "Wrote infra/.env (compose reads it automatically)."

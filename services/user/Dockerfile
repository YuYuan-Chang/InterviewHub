# Build context is the repo root (see infra/compose.yaml)
FROM node:22-slim
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY services/user/package.json services/user/
RUN npm ci --workspace @interviewhub/shared --workspace @interviewhub/user-service

COPY packages/shared packages/shared
COPY services/user services/user
RUN npm run build -w @interviewhub/shared \
 && npx prisma generate --schema services/user/prisma/schema.prisma \
 && npm run build -w @interviewhub/user-service

ENV NODE_ENV=production
EXPOSE 4002
# prisma db push is idempotent: it creates/updates the schema on boot, then the service starts.
CMD ["sh", "-c", "until npx prisma migrate deploy --schema services/user/prisma/schema.prisma; do echo 'database not ready, retrying in 3s'; sleep 3; done && exec node services/user/dist/index.js"]

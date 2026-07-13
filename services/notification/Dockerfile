# Build context is the repo root (see infra/compose.yaml)
FROM node:22-slim
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY services/notification/package.json services/notification/
RUN npm ci --workspace @interviewhub/shared --workspace @interviewhub/notification-service

COPY packages/shared packages/shared
COPY services/notification services/notification
RUN npm run build -w @interviewhub/shared \
 && npx prisma generate --schema services/notification/prisma/schema.prisma \
 && npm run build -w @interviewhub/notification-service

ENV NODE_ENV=production
EXPOSE 4006
# prisma db push is idempotent: it creates/updates the schema on boot, then the service starts.
CMD ["sh", "-c", "until npx prisma migrate deploy --schema services/notification/prisma/schema.prisma; do echo 'database not ready, retrying in 3s'; sleep 3; done && node services/notification/dist/index.js"]

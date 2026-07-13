# Build context is the repo root (see infra/compose.yaml)
FROM node:22-slim
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY services/comment/package.json services/comment/
RUN npm ci --workspace @interviewhub/shared --workspace @interviewhub/comment-service

COPY packages/shared packages/shared
COPY services/comment services/comment
RUN npm run build -w @interviewhub/shared \
 && npx prisma generate --schema services/comment/prisma/schema.prisma \
 && npm run build -w @interviewhub/comment-service

ENV NODE_ENV=production
EXPOSE 4005
# prisma db push is idempotent: it creates/updates the schema on boot, then the service starts.
CMD ["sh", "-c", "until npx prisma migrate deploy --schema services/comment/prisma/schema.prisma; do echo 'database not ready, retrying in 3s'; sleep 3; done && exec node services/comment/dist/index.js"]

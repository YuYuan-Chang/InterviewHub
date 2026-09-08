CREATE TABLE "outbox" (
  "id" TEXT PRIMARY KEY, "payload" JSONB NOT NULL, "attempts" INTEGER NOT NULL DEFAULT 0,
  "available_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "outbox_available_at_idx" ON "outbox"("available_at");

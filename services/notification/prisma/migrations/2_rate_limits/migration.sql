CREATE TABLE "rate_limits" ("key" TEXT PRIMARY KEY, "hits" INTEGER NOT NULL, "expires_at" TIMESTAMP(3) NOT NULL);
CREATE INDEX "rate_limits_expires_at_idx" ON "rate_limits"("expires_at");

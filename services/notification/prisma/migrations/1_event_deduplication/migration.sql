ALTER TABLE "notifications" ADD COLUMN "event_id" TEXT;
CREATE UNIQUE INDEX "notifications_event_id_key" ON "notifications"("event_id");

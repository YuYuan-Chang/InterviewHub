CREATE TABLE "preparation_plans" (
  "id" TEXT PRIMARY KEY, "owner_id" TEXT NOT NULL, "name" TEXT NOT NULL,
  "company" TEXT NOT NULL DEFAULT '', "role" TEXT NOT NULL DEFAULT '', "collection_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "preparation_tasks" (
  "id" TEXT PRIMARY KEY, "plan_id" TEXT NOT NULL REFERENCES "preparation_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "title" TEXT NOT NULL, "due_date" TEXT, "completed" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "preparation_interviews" (
  "id" TEXT PRIMARY KEY, "plan_id" TEXT NOT NULL REFERENCES "preparation_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "stage" TEXT NOT NULL, "scheduled_at" TIMESTAMP(3) NOT NULL, "notes" TEXT NOT NULL DEFAULT '',
  "status" TEXT NOT NULL DEFAULT 'scheduled', "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "preparation_plans_owner_id_created_at_id_idx" ON "preparation_plans"("owner_id", "created_at", "id");
CREATE INDEX "preparation_tasks_plan_id_created_at_id_idx" ON "preparation_tasks"("plan_id", "created_at", "id");
CREATE INDEX "preparation_interviews_plan_id_scheduled_at_id_idx" ON "preparation_interviews"("plan_id", "scheduled_at", "id");
CREATE INDEX "preparation_interviews_status_scheduled_at_id_idx" ON "preparation_interviews"("status", "scheduled_at", "id");

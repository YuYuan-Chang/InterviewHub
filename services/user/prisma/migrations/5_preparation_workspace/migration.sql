ALTER TABLE "preparation_plans"
ADD COLUMN "job_url" TEXT NOT NULL DEFAULT '',
ADD COLUMN "job_description" TEXT NOT NULL DEFAULT '',
ADD COLUMN "notes" TEXT NOT NULL DEFAULT '';

CREATE TABLE "preparation_questions" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "plan_id" TEXT NOT NULL,
  "prompt" TEXT NOT NULL,
  "answer" TEXT NOT NULL DEFAULT '',
  "readiness" TEXT NOT NULL DEFAULT 'new',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "preparation_questions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "preparation_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "preparation_questions_plan_id_created_at_id_idx" ON "preparation_questions"("plan_id", "created_at", "id");

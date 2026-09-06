ALTER TABLE "posts" ADD COLUMN "resume_text" TEXT,
ADD COLUMN "resume_version" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE "resume_revisions" (
  "id" TEXT NOT NULL,
  "post_id" TEXT NOT NULL,
  "author_id" TEXT NOT NULL,
  "base_version" INTEGER NOT NULL,
  "proposed_text" TEXT NOT NULL,
  "patch" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolved_at" TIMESTAMP(3),
  CONSTRAINT "resume_revisions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "resume_revisions_status_check" CHECK ("status" IN ('pending', 'accepted', 'rejected')),
  CONSTRAINT "resume_revisions_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "resume_revisions_post_id_created_at_id_idx" ON "resume_revisions"("post_id", "created_at" DESC, "id" DESC);

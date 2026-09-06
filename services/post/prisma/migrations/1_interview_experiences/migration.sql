CREATE TABLE "interview_experiences" (
    "post_id" TEXT NOT NULL,
    "company" VARCHAR(120) NOT NULL,
    "role" VARCHAR(120) NOT NULL,
    "stage" TEXT NOT NULL,
    "questions" TEXT NOT NULL,
    "difficulty" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    CONSTRAINT "interview_experiences_pkey" PRIMARY KEY ("post_id"),
    CONSTRAINT "interview_experiences_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "interview_experiences_company_role_idx" ON "interview_experiences"("company", "role");

CREATE TABLE "saved_resources" (
    "user_id" TEXT NOT NULL,
    "post_id" TEXT NOT NULL,
    "saved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT NOT NULL DEFAULT '',
    "reviewed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "saved_resources_pkey" PRIMARY KEY ("user_id", "post_id")
);

CREATE TABLE "saved_collections" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saved_collections_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "saved_collection_memberships" (
    "collection_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "post_id" TEXT NOT NULL,

    CONSTRAINT "saved_collection_memberships_pkey" PRIMARY KEY ("collection_id", "user_id", "post_id")
);

CREATE INDEX "saved_resources_user_id_saved_at_post_id_idx" ON "saved_resources"("user_id", "saved_at" DESC, "post_id" DESC);
CREATE INDEX "saved_resources_user_id_reviewed_saved_at_post_id_idx" ON "saved_resources"("user_id", "reviewed", "saved_at" DESC, "post_id" DESC);
CREATE INDEX "saved_resources_post_id_idx" ON "saved_resources"("post_id");
CREATE UNIQUE INDEX "saved_collections_user_id_name_key" ON "saved_collections"("user_id", "name");
CREATE UNIQUE INDEX "saved_collections_id_user_id_key" ON "saved_collections"("id", "user_id");
CREATE INDEX "saved_collection_memberships_user_id_post_id_idx" ON "saved_collection_memberships"("user_id", "post_id");

ALTER TABLE "saved_resources" ADD CONSTRAINT "saved_resources_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "saved_collection_memberships" ADD CONSTRAINT "saved_collection_memberships_collection_id_user_id_fkey" FOREIGN KEY ("collection_id", "user_id") REFERENCES "saved_collections"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "saved_collection_memberships" ADD CONSTRAINT "saved_collection_memberships_user_id_post_id_fkey" FOREIGN KEY ("user_id", "post_id") REFERENCES "saved_resources"("user_id", "post_id") ON DELETE CASCADE ON UPDATE CASCADE;

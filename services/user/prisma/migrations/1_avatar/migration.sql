-- Profile avatars: nullable pointer to a file-service asset (additive, no data loss)
ALTER TABLE "profiles" ADD COLUMN "avatar_file_id" TEXT;

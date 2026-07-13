-- Existing filesystem audio is disposable. Clear ready states whose files are
-- not migrated into object storage so they can be regenerated safely.
UPDATE "podcast_episodes" SET "status" = 'placeholder', "generated_at" = NULL
WHERE "episode_id" IN (SELECT "episode_id" FROM "podcast_audio_assets");
DELETE FROM "podcast_audio_assets";
ALTER TABLE "podcast_audio_assets" DROP COLUMN "file_path";

UPDATE "personal_podcasts"
SET "status" = 'failed',
    "status_message" = 'Audio must be regenerated after the storage upgrade',
    "error_message" = 'Legacy filesystem audio was not migrated',
    "progress_percent" = 95
WHERE "audio_path" IS NOT NULL;
ALTER TABLE "personal_podcasts" RENAME COLUMN "audio_path" TO "audio_storage_key";
ALTER TABLE "personal_podcasts" DROP COLUMN "audio_url";
UPDATE "personal_podcasts" SET "audio_storage_key" = NULL;

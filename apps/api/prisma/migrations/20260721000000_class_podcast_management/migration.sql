ALTER TABLE "podcast_classes"
ADD COLUMN "voice_defaults" JSONB;

ALTER TABLE "podcast_episodes"
ADD COLUMN "title_override" TEXT,
ADD COLUMN "draft_summary" TEXT,
ADD COLUMN "draft_duration_target_minutes" INTEGER,
ADD COLUMN "draft_turns" JSONB,
ADD COLUMN "draft_revision" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "voice_overrides" JSONB,
ADD COLUMN "published_job_id" UUID;

ALTER TABLE "generation_jobs"
ADD COLUMN "progress_percent" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN "status_message" TEXT NOT NULL DEFAULT 'Waiting to start',
ADD COLUMN "draft_revision" INTEGER,
ADD COLUMN "settings_snapshot" JSONB;

UPDATE "podcast_episodes" AS episode
SET "published_job_id" = (
  SELECT job."id"
  FROM "generation_jobs" AS job
  WHERE job."episode_id" = episode."episode_id"
    AND job."status" = 'ready'
  ORDER BY job."created_at" DESC
  LIMIT 1
);

CREATE UNIQUE INDEX "podcast_episodes_published_job_id_key"
ON "podcast_episodes"("published_job_id");

ALTER TABLE "podcast_episodes"
ADD CONSTRAINT "podcast_episodes_published_job_id_fkey"
FOREIGN KEY ("published_job_id") REFERENCES "generation_jobs"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

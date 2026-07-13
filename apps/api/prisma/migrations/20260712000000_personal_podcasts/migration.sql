CREATE TYPE "PersonalPodcastStatus" AS ENUM (
  'queued',
  'preparing_materials',
  'generating_script',
  'validating_script',
  'generating_audio',
  'saving',
  'ready',
  'failed'
);

CREATE TABLE "personal_podcasts" (
  "id" UUID NOT NULL,
  "class_id" TEXT NOT NULL,
  "owner_user_id" TEXT NOT NULL,
  "prompt" TEXT NOT NULL,
  "title" TEXT,
  "summary" TEXT,
  "duration_minutes" INTEGER NOT NULL,
  "difficulty" TEXT NOT NULL,
  "status" "PersonalPodcastStatus" NOT NULL DEFAULT 'queued',
  "progress_percent" INTEGER NOT NULL DEFAULT 5,
  "status_message" TEXT NOT NULL DEFAULT 'Waiting to start',
  "selected_materials" JSONB NOT NULL,
  "source_metadata" JSONB,
  "turns" JSONB,
  "audio_path" TEXT,
  "audio_url" TEXT,
  "error_message" TEXT,
  "started_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "personal_podcasts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "personal_podcasts_class_id_owner_user_id_created_at_idx"
ON "personal_podcasts"("class_id", "owner_user_id", "created_at");

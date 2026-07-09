CREATE TYPE "PodcastJobStatus" AS ENUM ('placeholder', 'generating', 'ready', 'failed');

CREATE TABLE "podcast_classes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "class_id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "cover_theme" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "podcast_classes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "source_documents" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "class_id" TEXT NOT NULL,
  "kiwi_document_id" TEXT NOT NULL,
  "document_name" TEXT NOT NULL,
  "material_type" TEXT NOT NULL,
  "lecture_number" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "source_documents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "podcast_episodes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "episode_id" TEXT NOT NULL,
  "class_id" TEXT NOT NULL,
  "kiwi_document_id" TEXT NOT NULL,
  "source_document_id" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "duration_label" TEXT NOT NULL,
  "status" "PodcastJobStatus" NOT NULL DEFAULT 'placeholder',
  "generated_at" TIMESTAMP(3),
  "error_message" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "podcast_episodes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "generation_jobs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "episode_id" TEXT NOT NULL,
  "class_id" TEXT NOT NULL,
  "kiwi_document_id" TEXT NOT NULL,
  "status" "PodcastJobStatus" NOT NULL,
  "input_metadata" JSONB,
  "error_message" TEXT,
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finished_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "generation_jobs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "podcast_scripts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "episode_id" TEXT NOT NULL,
  "job_id" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "duration_target_minutes" INTEGER NOT NULL,
  "turns" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "podcast_scripts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "podcast_audio_assets" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "episode_id" TEXT NOT NULL,
  "job_id" UUID NOT NULL,
  "storage_key" TEXT NOT NULL,
  "file_path" TEXT NOT NULL,
  "mime_type" TEXT NOT NULL,
  "byte_size" INTEGER NOT NULL,
  "checksum" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "podcast_audio_assets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "podcast_classes_class_id_key" ON "podcast_classes"("class_id");
CREATE UNIQUE INDEX "source_documents_class_id_kiwi_document_id_key" ON "source_documents"("class_id", "kiwi_document_id");
CREATE INDEX "source_documents_class_id_idx" ON "source_documents"("class_id");
CREATE UNIQUE INDEX "podcast_episodes_episode_id_key" ON "podcast_episodes"("episode_id");
CREATE UNIQUE INDEX "podcast_episodes_source_document_id_key" ON "podcast_episodes"("source_document_id");
CREATE UNIQUE INDEX "podcast_episodes_class_id_kiwi_document_id_key" ON "podcast_episodes"("class_id", "kiwi_document_id");
CREATE INDEX "podcast_episodes_class_id_idx" ON "podcast_episodes"("class_id");
CREATE INDEX "generation_jobs_episode_id_created_at_idx" ON "generation_jobs"("episode_id", "created_at");
CREATE INDEX "generation_jobs_class_id_kiwi_document_id_idx" ON "generation_jobs"("class_id", "kiwi_document_id");
CREATE UNIQUE INDEX "generation_jobs_active_episode_id_key" ON "generation_jobs"("episode_id") WHERE "status" = 'generating';
CREATE UNIQUE INDEX "podcast_scripts_job_id_key" ON "podcast_scripts"("job_id");
CREATE INDEX "podcast_scripts_episode_id_created_at_idx" ON "podcast_scripts"("episode_id", "created_at");
CREATE UNIQUE INDEX "podcast_audio_assets_job_id_key" ON "podcast_audio_assets"("job_id");
CREATE INDEX "podcast_audio_assets_episode_id_created_at_idx" ON "podcast_audio_assets"("episode_id", "created_at");

ALTER TABLE "source_documents" ADD CONSTRAINT "source_documents_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "podcast_classes"("class_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "podcast_episodes" ADD CONSTRAINT "podcast_episodes_source_document_id_fkey" FOREIGN KEY ("source_document_id") REFERENCES "source_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_episode_id_fkey" FOREIGN KEY ("episode_id") REFERENCES "podcast_episodes"("episode_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "podcast_scripts" ADD CONSTRAINT "podcast_scripts_episode_id_fkey" FOREIGN KEY ("episode_id") REFERENCES "podcast_episodes"("episode_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "podcast_scripts" ADD CONSTRAINT "podcast_scripts_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "generation_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "podcast_audio_assets" ADD CONSTRAINT "podcast_audio_assets_episode_id_fkey" FOREIGN KEY ("episode_id") REFERENCES "podcast_episodes"("episode_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "podcast_audio_assets" ADD CONSTRAINT "podcast_audio_assets_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "generation_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

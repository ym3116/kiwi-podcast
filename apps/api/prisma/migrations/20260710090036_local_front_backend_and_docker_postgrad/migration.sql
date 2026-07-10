-- AlterTable
ALTER TABLE "generation_jobs" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "podcast_audio_assets" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "podcast_classes" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "podcast_episodes" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "podcast_scripts" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "source_documents" ALTER COLUMN "id" DROP DEFAULT;

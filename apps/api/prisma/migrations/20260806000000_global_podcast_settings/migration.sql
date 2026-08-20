CREATE TABLE "podcast_global_settings" (
  "key" TEXT NOT NULL,
  "voice_defaults" JSONB NOT NULL,
  "updated_by_user_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "podcast_global_settings_pkey" PRIMARY KEY ("key")
);

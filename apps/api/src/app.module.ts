import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health/health.controller';
import { KiwiMcpClient } from './mcp/kiwi-mcp.client';
import { LocalDemoChunkSource } from './podcast/local-demo-chunk-source';
import { PodcastArtifactStore } from './podcast/podcast-artifact.store';
import { PodcastController } from './podcast/podcast.controller';
import { PodcastGenerationService } from './podcast/podcast-generation.service';
import { PodcastService } from './podcast/podcast.service';
import { ScriptGeneratorService } from './podcast/script-generator.service';
import { TtsService } from './podcast/tts.service';
import { PersonalPodcastService } from './podcast/personal-podcast.service';
import { AudioProductionService } from './podcast/audio-production.service';
import { AUDIO_S3_CLIENT, AudioStorageService, createAudioS3Client } from './storage/audio-storage.service';
import { PodcastManagementController } from './podcast/podcast-management.controller';
import { PodcastManagementService } from './podcast/podcast-management.service';
import { PodcastManagementAuthService } from './podcast/podcast-management-auth.service';
import { KiwiDocumentChunkSource } from './podcast/kiwi-document-chunk-source';
import { PodcastChunkSourceService } from './podcast/podcast-chunk-source.service';
import { PodcastAccessAuthService } from './podcast/podcast-access-auth.service';
import { InterruptedJobRecoveryService } from './podcast/interrupted-job-recovery.service';
import { PodcastAdminAuthService } from './podcast/podcast-admin-auth.service';
import { PodcastAdminController } from './podcast/podcast-admin.controller';
import { PodcastGlobalSettingsService } from './podcast/podcast-global-settings.service';
import { PodcastVoiceSettingsService } from './podcast/podcast-voice-settings.service';

@Module({
  imports: [DatabaseModule],
  controllers: [
    HealthController,
    PodcastController,
    PodcastManagementController,
    PodcastAdminController,
  ],
  providers: [
    KiwiMcpClient,
    LocalDemoChunkSource,
    KiwiDocumentChunkSource,
    PodcastChunkSourceService,
    PodcastArtifactStore,
    PodcastGenerationService,
    PodcastService,
    ScriptGeneratorService,
    TtsService,
    PersonalPodcastService,
    AudioProductionService,
    PodcastManagementService,
    PodcastAccessAuthService,
    InterruptedJobRecoveryService,
    PodcastManagementAuthService,
    PodcastAdminAuthService,
    PodcastGlobalSettingsService,
    PodcastVoiceSettingsService,
    AudioStorageService,
    { provide: AUDIO_S3_CLIENT, useFactory: createAudioS3Client },
  ],
})
export class AppModule {}

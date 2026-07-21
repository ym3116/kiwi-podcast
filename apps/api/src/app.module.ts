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

@Module({
  imports: [DatabaseModule],
  controllers: [HealthController, PodcastController],
  providers: [
    KiwiMcpClient,
    LocalDemoChunkSource,
    PodcastArtifactStore,
    PodcastGenerationService,
    PodcastService,
    ScriptGeneratorService,
    TtsService,
    PersonalPodcastService,
    AudioProductionService,
    AudioStorageService,
    { provide: AUDIO_S3_CLIENT, useFactory: createAudioS3Client },
  ],
})
export class AppModule {}

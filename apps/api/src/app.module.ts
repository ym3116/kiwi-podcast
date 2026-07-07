import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller';
import { KiwiMcpClient } from './mcp/kiwi-mcp.client';
import { LocalDemoChunkSource } from './podcast/local-demo-chunk-source';
import { PodcastArtifactStore } from './podcast/podcast-artifact.store';
import { PodcastController } from './podcast/podcast.controller';
import { PodcastGenerationService } from './podcast/podcast-generation.service';
import { PodcastService } from './podcast/podcast.service';
import { ScriptGeneratorService } from './podcast/script-generator.service';
import { TtsService } from './podcast/tts.service';

@Module({
  controllers: [HealthController, PodcastController],
  providers: [
    KiwiMcpClient,
    LocalDemoChunkSource,
    PodcastArtifactStore,
    PodcastGenerationService,
    PodcastService,
    ScriptGeneratorService,
    TtsService,
  ],
})
export class AppModule {}

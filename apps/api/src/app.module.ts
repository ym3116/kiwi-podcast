import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller';
import { KiwiMcpClient } from './mcp/kiwi-mcp.client';
import { PodcastController } from './podcast/podcast.controller';
import { PodcastService } from './podcast/podcast.service';

@Module({
  controllers: [HealthController, PodcastController],
  providers: [KiwiMcpClient, PodcastService],
})
export class AppModule {}

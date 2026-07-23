import { Inject, Injectable } from '@nestjs/common';
import { KiwiMcpClient } from '../mcp/kiwi-mcp.client';
import { KiwiMaterialsPayload, PodcastResponse } from '../types/podcast';
import { PodcastGenerationService } from './podcast-generation.service';
import { normalizePodcastPayload } from './podcast-normalizer';

@Injectable()
export class PodcastService {
  constructor(
    @Inject(KiwiMcpClient) private readonly mcpClient: KiwiMcpClient,
    @Inject(PodcastGenerationService)
    private readonly generationService: PodcastGenerationService,
  ) {}

  async getClassPodcast(classId: string, accessToken: string): Promise<PodcastResponse> {
    const materialsUri = `kiwi://class/${classId}/materials`;
    const documentsUri = `kiwi://class/${classId}/documents`;

    try {
      const materials = (await this.mcpClient.readResource(
        accessToken,
        materialsUri,
      )) as KiwiMaterialsPayload;
      return this.withStoredCatalog(normalizePodcastPayload(classId, materials));
    } catch (error) {
      const failedMessage = error instanceof Error ? error.message : String(error);
      if (!this.shouldFallback(failedMessage)) {
        throw error;
      }

      const documents = (await this.mcpClient.readResource(
        accessToken,
        documentsUri,
      )) as KiwiMaterialsPayload;
      return this.withStoredCatalog(normalizePodcastPayload(classId, documents));
    }
  }

  async generateEpisode(classId: string, documentId: string, accessToken: string) {
    return this.generationService.generate(classId, documentId, accessToken);
  }

  async getGenerationStatus(classId: string, documentId: string) {
    return this.generationService.getStatus(classId, documentId);
  }

  getAudioStorageKey(episodeId: string): Promise<string | null> {
    return this.generationService.getAudioStorageKey(episodeId);
  }

  private shouldFallback(message: string): boolean {
    return /invalid uri|not found|unknown resource|class materials/i.test(message);
  }

  private async withGeneratedArtifacts(response: PodcastResponse): Promise<PodcastResponse> {
    return {
      ...response,
      episodes: await Promise.all(
        response.episodes.map((episode) => this.generationService.overlayEpisode(episode)),
      ),
    };
  }

  private async withStoredCatalog(response: PodcastResponse): Promise<PodcastResponse> {
    await this.generationService.syncPodcastCatalog(response);
    return this.withGeneratedArtifacts(response);
  }
}

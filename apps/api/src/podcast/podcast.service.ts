import { Injectable } from '@nestjs/common';
import { KiwiMcpClient } from '../mcp/kiwi-mcp.client';
import { KiwiMaterialsPayload, PodcastResponse } from '../types/podcast';
import { normalizePodcastPayload } from './podcast-normalizer';

@Injectable()
export class PodcastService {
  constructor(private readonly mcpClient: KiwiMcpClient) {}

  async getClassPodcast(classId: string, accessToken: string): Promise<PodcastResponse> {
    const materialsUri = `kiwi://class/${classId}/materials`;
    const documentsUri = `kiwi://class/${classId}/documents`;

    try {
      const materials = (await this.mcpClient.readResource(
        accessToken,
        materialsUri,
      )) as KiwiMaterialsPayload;
      return normalizePodcastPayload(classId, materials);
    } catch (error) {
      const failedMessage = error instanceof Error ? error.message : String(error);
      if (!this.shouldFallback(failedMessage)) {
        throw error;
      }

      const documents = (await this.mcpClient.readResource(
        accessToken,
        documentsUri,
      )) as KiwiMaterialsPayload;
      return normalizePodcastPayload(classId, documents);
    }
  }

  private shouldFallback(message: string): boolean {
    return /invalid uri|not found|unknown resource|class materials/i.test(message);
  }
}

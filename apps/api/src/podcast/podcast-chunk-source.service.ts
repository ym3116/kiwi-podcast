import { Inject, Injectable } from '@nestjs/common';
import { KiwiDocumentChunkSource } from './kiwi-document-chunk-source';
import { LocalDemoChunkSource } from './local-demo-chunk-source';
import {
  PodcastChunkBundle,
  PodcastChunkSource,
  PodcastMaterial,
} from './podcast-chunk-source';
import { PodcastChunkInput } from './podcast-generation.types';

export const SIMULATOR_ACCESS_TOKEN = 'simulated-kiwi-app-token';

@Injectable()
export class PodcastChunkSourceService implements PodcastChunkSource {
  constructor(
    @Inject(LocalDemoChunkSource) private readonly local: LocalDemoChunkSource,
    @Inject(KiwiDocumentChunkSource) private readonly kiwi: KiwiDocumentChunkSource,
  ) {}

  getChunks(
    classId: string,
    documentId: string,
    accessToken: string,
    canonical?: { documentName: string },
  ): Promise<PodcastChunkInput> {
    return this.source(accessToken).getChunks(classId, documentId, accessToken, canonical);
  }

  listMaterials(classId: string, accessToken: string): Promise<PodcastMaterial[]> {
    return this.source(accessToken).listMaterials(classId, accessToken);
  }

  getCombinedChunks(
    classId: string,
    documentIds: string[],
    accessToken: string,
  ): Promise<PodcastChunkBundle> {
    return this.source(accessToken).getCombinedChunks(classId, documentIds, accessToken);
  }

  private source(accessToken: string): PodcastChunkSource {
    return accessToken === SIMULATOR_ACCESS_TOKEN ? this.local : this.kiwi;
  }
}

import { PodcastChunkInput } from './podcast-generation.types';

export interface PodcastMaterial {
  id: string;
  documentId: string;
  documentName: string;
  materialId?: string;
  materialType: string;
  chunkCount: number;
  pageCount?: number;
  preview: string;
}

export interface PodcastChunkBundle extends PodcastChunkInput {
  sourceMetadata: Array<Record<string, unknown>>;
}

export interface PodcastChunkSource {
  getChunks(
    classId: string,
    documentId: string,
    accessToken: string,
    canonical?: { documentName: string },
  ): Promise<PodcastChunkInput>;

  listMaterials(classId: string, accessToken: string): Promise<PodcastMaterial[]>;

  getCombinedChunks(
    classId: string,
    documentIds: string[],
    accessToken: string,
  ): Promise<PodcastChunkBundle>;
}

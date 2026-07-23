import { Injectable } from '@nestjs/common';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  PodcastChunkBundle,
  PodcastChunkSource,
  PodcastMaterial,
} from './podcast-chunk-source';
import { PodcastChunkInput } from './podcast-generation.types';

@Injectable()
export class LocalDemoChunkSource implements PodcastChunkSource {
  private readonly chunkDir =
    process.env.PODCAST_DEMO_CHUNKS_DIR ?? path.resolve(__dirname, '../../demo-chunks');

  async getChunks(
    classId: string,
    documentId: string,
    _accessToken: string,
    canonical?: { documentName: string },
  ): Promise<PodcastChunkInput> {
    const payload = await this.readChunkFile(documentId, Boolean(canonical));
    if (canonical && payload.documentId && payload.documentId !== documentId) {
      throw new Error(`Local chunk documentId ${payload.documentId} does not match Kiwi document ${documentId}`);
    }
    if (canonical && payload.classId && payload.classId !== classId) {
      throw new Error(`Local chunk classId ${payload.classId} does not match Kiwi class ${classId}`);
    }
    const rawChunks = Array.isArray(payload.chunks) ? payload.chunks : [];
    const chunks = rawChunks
      .map((chunk) => ({
        text: typeof chunk.text === 'string' ? chunk.text.trim() : '',
        pageNumber: chunk.pageNumber ? String(chunk.pageNumber) : undefined,
      }))
      .filter((chunk) => chunk.text);

    if (chunks.length === 0) {
      throw new Error(`Demo chunk file for ${documentId} does not contain any text chunks`);
    }

    return {
      classId: canonical ? classId : payload.classId || classId,
      documentId: canonical ? documentId : payload.documentId || documentId,
      documentName: canonical?.documentName || payload.documentName || documentId,
      chunks,
    };
  }

  async listMaterials(_classId: string, _accessToken: string): Promise<PodcastMaterial[]> {
    const files = (await readdir(this.chunkDir)).filter((file) => file.endsWith('.json')).sort();
    const materials: Array<PodcastMaterial | null> = await Promise.all(
      files.map(async (file) => {
        try {
          const payload = JSON.parse(
            await readFile(path.join(this.chunkDir, file), 'utf8'),
          ) as LocalChunkFile;
          if (!payload.documentId || !payload.documentName || !Array.isArray(payload.chunks)) {
            return null;
          }
          const chunks = payload.chunks.filter((chunk) => chunk.text?.trim());
          const pages = new Set(chunks.map((chunk) => chunk.pageNumber).filter(Boolean));
          return {
            id: payload.documentId,
            documentId: payload.documentId,
            documentName: payload.documentName,
            materialId: payload.materialId,
            materialType: payload.materialType ?? 'class material',
            chunkCount: chunks.length,
            pageCount: pages.size || undefined,
            preview: chunks
              .slice(0, 3)
              .map((chunk) => chunk.text?.replace(/\s+/g, ' ').trim())
              .filter(Boolean)
              .join(' ')
              .slice(0, 240),
          };
        } catch {
          return null;
        }
      }),
    );
    return materials.filter((material): material is PodcastMaterial => material !== null);
  }

  async getCombinedChunks(
    classId: string,
    documentIds: string[],
    accessToken: string,
  ): Promise<PodcastChunkBundle> {
    const inputs = await Promise.all(
      documentIds.map((id) => this.getChunks(classId, id, accessToken)),
    );
    const maxCharacters = Number(process.env.PODCAST_MAX_SOURCE_CHARACTERS ?? 60000);
    const perMaterialBudget = Math.max(1, Math.floor(maxCharacters / inputs.length));
    const chunks = inputs.flatMap((input) => {
      let used = 0;
      return input.chunks.flatMap((chunk) => {
        if (used + chunk.text.length > perMaterialBudget) return [];
        used += chunk.text.length;
        return [{ ...chunk, documentId: input.documentId, documentName: input.documentName }];
      });
    });
    return {
      classId,
      documentId: documentIds.join(','),
      documentName: inputs.map((input) => input.documentName).join(', '),
      chunks,
      sourceMetadata: inputs.map((input) => ({
        documentId: input.documentId,
        documentName: input.documentName,
        includedChunks: chunks.filter((chunk) => chunk.documentId === input.documentId).length,
        availableChunks: input.chunks.length,
      })),
    };
  }

  private async readChunkFile(documentId: string, realKiwiDocument = false): Promise<LocalChunkFile> {
    const fileName = `${this.safeDocumentId(documentId)}.json`;
    const filePath = path.join(this.chunkDir, fileName);

    try {
      return JSON.parse(await readFile(filePath, 'utf8')) as LocalChunkFile;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        if (realKiwiDocument) throw new Error(`Local chunks are not available for Kiwi document ${documentId}`);
        throw new Error(`Demo chunk file not found for document ${documentId}: ${filePath}`);
      }
      throw error;
    }
  }

  private safeDocumentId(documentId: string): string {
    if (!/^[a-zA-Z0-9._-]+$/.test(documentId)) {
      throw new Error('Document ID can only contain letters, numbers, dots, underscores, and dashes');
    }
    return documentId;
  }
}

interface LocalChunkFile {
  classId?: string;
  documentId?: string;
  documentName?: string;
  materialId?: string;
  materialType?: string;
  chunks: Array<{ text?: string; pageNumber?: string | number }>;
}

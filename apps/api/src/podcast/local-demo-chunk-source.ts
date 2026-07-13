import { Injectable } from '@nestjs/common';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { PodcastChunkInput } from './podcast-generation.types';

export interface PodcastChunkSource {
  getChunks(classId: string, documentId: string): Promise<PodcastChunkInput>;
}

export interface DemoMaterial {
  id: string;
  documentId: string;
  documentName: string;
  materialId?: string;
  materialType: string;
  chunkCount: number;
  pageCount?: number;
  preview: string;
}

@Injectable()
export class LocalDemoChunkSource implements PodcastChunkSource {
  private readonly chunkDir =
    process.env.PODCAST_DEMO_CHUNKS_DIR ?? path.resolve(__dirname, '../../demo-chunks');

  async getChunks(classId: string, documentId: string): Promise<PodcastChunkInput> {
    const payload = await this.readChunkFile(documentId);
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
      classId: payload.classId || classId,
      documentId: payload.documentId || documentId,
      documentName: payload.documentName || documentId,
      chunks,
    };
  }

  async listDemoMaterials(): Promise<DemoMaterial[]> {
    const files = (await readdir(this.chunkDir)).filter((file) => file.endsWith('.json')).sort();
    const materials: Array<DemoMaterial | null> = await Promise.all(
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
    return materials.filter((material): material is DemoMaterial => material !== null);
  }

  async getCombinedChunks(
    classId: string,
    documentIds: string[],
  ): Promise<PodcastChunkInput & { sourceMetadata: Array<Record<string, unknown>> }> {
    const inputs = await Promise.all(documentIds.map((id) => this.getChunks(classId, id)));
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

  private async readChunkFile(documentId: string): Promise<LocalChunkFile> {
    const fileName = `${this.safeDocumentId(documentId)}.json`;
    const filePath = path.join(this.chunkDir, fileName);

    try {
      return JSON.parse(await readFile(filePath, 'utf8')) as LocalChunkFile;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
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

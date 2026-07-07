import { Injectable } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PodcastChunkInput } from './podcast-generation.types';

export interface PodcastChunkSource {
  getChunks(classId: string, documentId: string): Promise<PodcastChunkInput>;
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
  chunks: Array<{ text?: string; pageNumber?: string | number }>;
}

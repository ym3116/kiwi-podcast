import { Inject, Injectable } from '@nestjs/common';
import { KiwiMcpClient } from '../mcp/kiwi-mcp.client';
import { KiwiDocument, KiwiMaterialsPayload } from '../types/podcast';
import {
  PodcastChunkBundle,
  PodcastChunkSource,
  PodcastMaterial,
} from './podcast-chunk-source';
import { PodcastChunk, PodcastChunkInput } from './podcast-generation.types';

interface KiwiAppChunk {
  chunkId: string;
  index: number;
  pageNumber: number | null;
  type: string;
  text: string;
}

interface KiwiAppDocumentChunks {
  documentId: string;
  fileName: string;
  totalChunks: number;
  chunks: KiwiAppChunk[];
}

interface KiwiChunkPage {
  classId: string;
  documents: KiwiAppDocumentChunks[];
  nextCursor: string | null;
  hasMore: boolean;
}

interface CanonicalDocument {
  documentId: string;
  documentName: string;
  materialType: string;
}

const PAGE_LIMIT = 200;
const DOCUMENT_IDS_PER_REQUEST = 20;

@Injectable()
export class KiwiDocumentChunkSource implements PodcastChunkSource {
  private readonly kiwiApiBase = (process.env.KIWI_API_BASE ?? 'http://localhost:3000').replace(
    /\/$/,
    '',
  );

  constructor(@Inject(KiwiMcpClient) private readonly kiwi: KiwiMcpClient) {}

  async getChunks(
    classId: string,
    documentId: string,
    accessToken: string,
    canonical?: { documentName: string },
  ): Promise<PodcastChunkInput> {
    const documents = await this.canonicalDocuments(classId, accessToken);
    const document = documents.find((candidate) => candidate.documentId === documentId);
    if (!document) {
      throw new Error(`Kiwi document ${documentId} is not available in class ${classId}`);
    }

    const chunksByDocument = await this.fetchDocuments(classId, [documentId], accessToken);
    const live = chunksByDocument.get(documentId);
    if (!live?.chunks.length) {
      throw new Error(`Kiwi document ${documentId} does not contain any text chunks`);
    }

    return {
      classId,
      documentId,
      documentName: canonical?.documentName || document.documentName || live.fileName,
      chunks: live.chunks,
    };
  }

  async listMaterials(classId: string, accessToken: string): Promise<PodcastMaterial[]> {
    const canonical = await this.canonicalDocuments(classId, accessToken);
    const chunksByDocument = new Map<string, AccumulatedDocument>();

    for (let index = 0; index < canonical.length; index += DOCUMENT_IDS_PER_REQUEST) {
      const ids = canonical
        .slice(index, index + DOCUMENT_IDS_PER_REQUEST)
        .map((document) => document.documentId);
      const batch = await this.fetchDocuments(classId, ids, accessToken);
      for (const [documentId, document] of batch) chunksByDocument.set(documentId, document);
    }

    return canonical.flatMap((document) => {
      const live = chunksByDocument.get(document.documentId);
      if (!live?.chunks.length) return [];
      const pages = new Set(live.chunks.map((chunk) => chunk.pageNumber).filter(Boolean));
      return [{
        id: document.documentId,
        documentId: document.documentId,
        documentName: document.documentName || live.fileName,
        materialType: document.materialType,
        chunkCount: live.totalChunks,
        pageCount: pages.size || undefined,
        preview: live.chunks
          .slice(0, 3)
          .map((chunk) => chunk.text.replace(/\s+/g, ' ').trim())
          .filter(Boolean)
          .join(' ')
          .slice(0, 240),
      }];
    });
  }

  async getCombinedChunks(
    classId: string,
    documentIds: string[],
    accessToken: string,
  ): Promise<PodcastChunkBundle> {
    const canonical = await this.canonicalDocuments(classId, accessToken);
    const canonicalById = new Map(canonical.map((document) => [document.documentId, document]));
    const unavailable = documentIds.find((documentId) => !canonicalById.has(documentId));
    if (unavailable) {
      throw new Error(`Kiwi document ${unavailable} is not available in class ${classId}`);
    }

    const chunksByDocument = await this.fetchDocuments(classId, documentIds, accessToken);
    const inputs = documentIds.map((documentId): PodcastChunkInput => {
      const live = chunksByDocument.get(documentId);
      if (!live?.chunks.length) {
        throw new Error(`Kiwi document ${documentId} does not contain any text chunks`);
      }
      return {
        classId,
        documentId,
        documentName: canonicalById.get(documentId)?.documentName || live.fileName,
        chunks: live.chunks,
      };
    });

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

  private async canonicalDocuments(
    classId: string,
    accessToken: string,
  ): Promise<CanonicalDocument[]> {
    const materialsUri = `kiwi://class/${classId}/materials`;
    const documentsUri = `kiwi://class/${classId}/documents`;
    let payload: KiwiMaterialsPayload;

    try {
      payload = (await this.kiwi.readResource(accessToken, materialsUri)) as KiwiMaterialsPayload;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/invalid uri|not found|unknown resource|class materials/i.test(message)) throw error;
      payload = (await this.kiwi.readResource(accessToken, documentsUri)) as KiwiMaterialsPayload;
    }

    if (payload?.error) throw new Error(payload.error);
    const raw = Array.isArray(payload?.materials?.documents)
      ? payload.materials.documents
      : Array.isArray(payload?.documents)
        ? payload.documents
        : [];
    const seen = new Set<string>();
    return raw.flatMap((document: KiwiDocument, index): CanonicalDocument[] => {
      const documentId = document.id || document.documentId;
      if (!documentId || seen.has(documentId)) return [];
      seen.add(documentId);
      return [{
        documentId,
        documentName:
          document.documentName?.trim()
          || document.fileName?.trim()
          || `Document ${index + 1}`,
        materialType: document.materialType?.trim() || 'class material',
      }];
    });
  }

  private async fetchDocuments(
    classId: string,
    documentIds: string[],
    accessToken: string,
  ): Promise<Map<string, AccumulatedDocument>> {
    if (documentIds.length === 0) {
      throw new Error('At least one Kiwi document ID is required to read chunks');
    }

    const documents = new Map<string, AccumulatedDocument>();
    const seenCursors = new Set<string>();
    let cursor: string | null = null;

    do {
      const query = new URLSearchParams({
        documentIds: documentIds.join(','),
        limit: String(PAGE_LIMIT),
      });
      if (cursor) query.set('cursor', cursor);
      const response = await fetch(
        `${this.kiwiApiBase}/api/kiwi-apps/classes/${encodeURIComponent(classId)}/document-chunks?${query}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      const text = await response.text();
      const body = this.parseBody(text);

      if (!response.ok) {
        throw new Error(this.requestError(response.status, body));
      }
      if (!this.isChunkPage(body) || body.classId !== classId) {
        throw new Error('Kiwi returned a malformed document chunks response');
      }

      for (const document of body.documents) {
        if (!documentIds.includes(document.documentId)) continue;
        const accumulated = documents.get(document.documentId) ?? {
          fileName: document.fileName,
          totalChunks: document.totalChunks,
          chunks: [],
        };
        accumulated.totalChunks = document.totalChunks;
        accumulated.chunks.push(...this.mapChunks(document.chunks));
        documents.set(document.documentId, accumulated);
      }

      if (!body.hasMore) {
        cursor = null;
        continue;
      }
      if (!body.nextCursor) {
        throw new Error('Kiwi document chunk pagination did not return a next cursor');
      }
      if (seenCursors.has(body.nextCursor)) {
        throw new Error('Kiwi document chunk pagination returned a repeated cursor');
      }
      seenCursors.add(body.nextCursor);
      cursor = body.nextCursor;
    } while (cursor);

    return documents;
  }

  private mapChunks(chunks: KiwiAppChunk[]): PodcastChunk[] {
    return chunks.flatMap((chunk) => {
      const text = typeof chunk?.text === 'string' ? chunk.text.trim() : '';
      if (!text) return [];
      return [{
        text,
        pageNumber:
          typeof chunk.pageNumber === 'number' && Number.isFinite(chunk.pageNumber)
            ? String(chunk.pageNumber)
            : undefined,
      }];
    });
  }

  private parseBody(text: string): unknown {
    if (!text.trim()) return null;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  private requestError(status: number, body: unknown): string {
    const candidate = body as { error?: unknown; message?: unknown } | null;
    const raw = candidate?.error ?? candidate?.message;
    const detail = Array.isArray(raw)
      ? raw.join(', ')
      : typeof raw === 'string'
        ? raw
        : typeof body === 'string'
          ? body
          : `HTTP ${status}`;
    if (status === 401) {
      return `Kiwi rejected or expired the app token while reading document chunks: ${detail}`;
    }
    if (status === 403) return `Kiwi denied document chunk access: ${detail}`;
    if (status === 400) return `Kiwi rejected the document chunk request: ${detail}`;
    return `Kiwi document chunk request failed: ${detail}`;
  }

  private isChunkPage(value: unknown): value is KiwiChunkPage {
    if (!value || typeof value !== 'object') return false;
    const page = value as Partial<KiwiChunkPage>;
    return typeof page.classId === 'string'
      && Array.isArray(page.documents)
      && page.documents.every((document) =>
        Boolean(document)
        && typeof document.documentId === 'string'
        && typeof document.fileName === 'string'
        && typeof document.totalChunks === 'number'
        && Array.isArray(document.chunks))
      && typeof page.hasMore === 'boolean'
      && (page.nextCursor === null || typeof page.nextCursor === 'string');
  }
}

interface AccumulatedDocument {
  fileName: string;
  totalChunks: number;
  chunks: PodcastChunk[];
}

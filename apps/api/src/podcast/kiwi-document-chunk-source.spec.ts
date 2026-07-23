import { afterEach, describe, expect, it, vi } from 'vitest';
import { KiwiMcpClient } from '../mcp/kiwi-mcp.client';
import { KiwiDocumentChunkSource } from './kiwi-document-chunk-source';

describe('KiwiDocumentChunkSource', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('uses canonical document ids, follows cursors, and preserves selection order', async () => {
    const kiwi = {
      readResource: vi.fn().mockResolvedValue({
        materials: {
          documents: [
            { id: 'doc-b', fileName: 'B.pdf', materialType: 'worksheet' },
            { id: 'doc-a', fileName: 'A.pdf', materialType: 'lecture' },
          ],
        },
      }),
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({
        classId: 'class-1',
        documents: [
          document('doc-a', 'A.pdf', 1, [chunk('a0', ' Alpha ', 1)]),
          document('doc-b', 'B.pdf', 2, [chunk('b0', 'Beta', 2)]),
        ],
        nextCursor: 'cursor-2',
        hasMore: true,
      }))
      .mockResolvedValueOnce(response({
        classId: 'class-1',
        documents: [document('doc-b', 'B.pdf', 2, [chunk('b1', 'Gamma', 3)])],
        nextCursor: null,
        hasMore: false,
      }));
    vi.stubGlobal('fetch', fetchMock);
    const source = new KiwiDocumentChunkSource(kiwi as unknown as KiwiMcpClient);

    const result = await source.getCombinedChunks(
      'class-1',
      ['doc-b', 'doc-a'],
      'app-token',
    );

    expect(result.chunks.map((item) => [item.documentId, item.text])).toEqual([
      ['doc-b', 'Beta'],
      ['doc-b', 'Gamma'],
      ['doc-a', 'Alpha'],
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [url, init] of fetchMock.mock.calls) {
      expect(String(url)).toContain('documentIds=doc-b%2Cdoc-a');
      expect(String(url)).toContain('limit=200');
      expect(init).toEqual({ headers: { Authorization: 'Bearer app-token' } });
    }
    expect(String(fetchMock.mock.calls[1][0])).toContain('cursor=cursor-2');
  });

  it('enriches only canonical documents and discards blank chunk text', async () => {
    const kiwi = {
      readResource: vi.fn().mockResolvedValue({
        documents: [
          { id: 'doc-safe', fileName: 'Questions.pdf', materialType: 'recitation' },
        ],
      }),
    };
    const fetchMock = vi.fn().mockResolvedValue(response({
      classId: 'class-1',
      documents: [
        document('doc-safe', 'Questions.pdf', 2, [
          chunk('safe-0', ' Useful text ', 4),
          chunk('safe-1', '   ', 5),
        ]),
        document('doc-answer-key', 'Answers.pdf', 1, [chunk('answer-0', 'Secret', 1)]),
      ],
      nextCursor: null,
      hasMore: false,
    }));
    vi.stubGlobal('fetch', fetchMock);
    const source = new KiwiDocumentChunkSource(kiwi as unknown as KiwiMcpClient);

    const materials = await source.listMaterials('class-1', 'app-token');

    expect(materials).toEqual([expect.objectContaining({
      id: 'doc-safe',
      documentName: 'Questions.pdf',
      materialType: 'recitation',
      chunkCount: 2,
      pageCount: 1,
      preview: 'Useful text',
    })]);
    expect(String(fetchMock.mock.calls[0][0])).toContain('documentIds=doc-safe');
    expect(String(fetchMock.mock.calls[0][0])).not.toContain('doc-answer-key');
  });

  it('rejects repeated pagination cursors', async () => {
    const kiwi = canonicalKiwi();
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => response({
        classId: 'class-1',
        documents: [document('doc-1', 'One.pdf', 3, [chunk('c0', 'Text', 1)])],
        nextCursor: 'same-cursor',
        hasMore: true,
      })));
    const source = new KiwiDocumentChunkSource(kiwi as unknown as KiwiMcpClient);

    await expect(
      source.getChunks('class-1', 'doc-1', 'app-token'),
    ).rejects.toThrow('repeated cursor');
  });

  it('returns a clear missing-scope error', async () => {
    const kiwi = canonicalKiwi();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(
      { message: 'Missing required scope: class:materials:chunks:read' },
      403,
    )));
    const source = new KiwiDocumentChunkSource(kiwi as unknown as KiwiMcpClient);

    await expect(
      source.getChunks('class-1', 'doc-1', 'app-token'),
    ).rejects.toThrow(
      'Kiwi denied document chunk access: Missing required scope: class:materials:chunks:read',
    );
  });

  it('rejects a requested document that is not in the canonical class catalog', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const source = new KiwiDocumentChunkSource(canonicalKiwi() as unknown as KiwiMcpClient);

    await expect(
      source.getChunks('class-1', 'doc-answer-key', 'app-token'),
    ).rejects.toThrow('is not available in class class-1');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

function canonicalKiwi() {
  return {
    readResource: vi.fn().mockResolvedValue({
      materials: {
        documents: [{ id: 'doc-1', fileName: 'One.pdf', materialType: 'lecture' }],
      },
    }),
  };
}

function document(
  documentId: string,
  fileName: string,
  totalChunks: number,
  chunks: ReturnType<typeof chunk>[],
) {
  return { documentId, fileName, totalChunks, chunks };
}

function chunk(chunkId: string, text: string, pageNumber: number) {
  return { chunkId, index: 0, pageNumber, type: 'CompositeElement', text };
}

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

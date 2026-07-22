import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { LocalDemoChunkSource } from './local-demo-chunk-source';

describe('LocalDemoChunkSource', () => {
  const originalDir = process.env.PODCAST_DEMO_CHUNKS_DIR;

  afterEach(() => {
    process.env.PODCAST_DEMO_CHUNKS_DIR = originalDir;
  });

  it('loads non-empty chunks from a demo chunk file', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'kiwi-podcast-chunks-'));
    process.env.PODCAST_DEMO_CHUNKS_DIR = dir;
    await writeFile(
      path.join(dir, 'doc-1.json'),
      JSON.stringify({
        classId: 'class-1',
        documentId: 'doc-1',
        documentName: 'Loops',
        chunks: [{ text: ' First chunk ', pageNumber: 2 }, { text: '  ' }],
      }),
    );

    const source = new LocalDemoChunkSource();
    const result = await source.getChunks('class-1', 'doc-1', { documentName: 'Canonical Kiwi name' });

    expect(result).toMatchObject({
      classId: 'class-1',
      documentId: 'doc-1',
      documentName: 'Canonical Kiwi name',
      chunks: [{ text: 'First chunk', pageNumber: '2' }],
    });
  });

  it('throws for missing demo chunk files', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'kiwi-podcast-chunks-'));
    process.env.PODCAST_DEMO_CHUNKS_DIR = dir;
    const source = new LocalDemoChunkSource();

    await expect(source.getChunks('class-1', 'missing', { documentName: 'Missing' })).rejects.toThrow(
      'Local chunks are not available for Kiwi document missing',
    );
  });

  it('rejects local identifiers that do not match the requested Kiwi document and class', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'kiwi-podcast-chunks-'));
    process.env.PODCAST_DEMO_CHUNKS_DIR = dir;
    await writeFile(path.join(dir, 'doc-1.json'), JSON.stringify({
      classId: 'wrong-class',
      documentId: 'wrong-document',
      chunks: [{ text: 'Do not use this.' }],
    }));
    const source = new LocalDemoChunkSource();

    await expect(source.getChunks('class-1', 'doc-1', { documentName: 'Canonical' })).rejects.toThrow(
      'does not match Kiwi document doc-1',
    );

    await writeFile(path.join(dir, 'doc-1.json'), JSON.stringify({
      classId: 'wrong-class', documentId: 'doc-1', chunks: [{ text: 'Still do not use this.' }],
    }));
    await expect(source.getChunks('class-1', 'doc-1', { documentName: 'Canonical' })).rejects.toThrow(
      'does not match Kiwi class class-1',
    );
  });

  it('keeps the personal-podcast demo catalog behavior outside real-Kiwi canonical mode', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'kiwi-podcast-chunks-'));
    process.env.PODCAST_DEMO_CHUNKS_DIR = dir;
    await writeFile(path.join(dir, 'doc-1.json'), JSON.stringify({
      classId: 'fixture-class', documentId: 'doc-1', documentName: 'Fixture name', chunks: [{ text: 'Demo text.' }],
    }));

    await expect(new LocalDemoChunkSource().getChunks('current-class', 'doc-1')).resolves.toMatchObject({
      classId: 'fixture-class', documentName: 'Fixture name',
    });
  });

  it('throws for empty chunk files', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'kiwi-podcast-chunks-'));
    process.env.PODCAST_DEMO_CHUNKS_DIR = dir;
    await writeFile(path.join(dir, 'doc-1.json'), JSON.stringify({ chunks: [{ text: ' ' }] }));
    const source = new LocalDemoChunkSource();

    await expect(source.getChunks('class-1', 'doc-1')).rejects.toThrow(
      'does not contain any text chunks',
    );
  });

  it('discovers materials and combines selected chunks in selection order', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'kiwi-podcast-chunks-'));
    process.env.PODCAST_DEMO_CHUNKS_DIR = dir;
    await Promise.all(
      [
        { documentId: 'doc-1', documentName: 'First lecture', chunks: [{ text: 'Alpha', pageNumber: 1 }] },
        { documentId: 'doc-2', documentName: 'Second lecture', chunks: [{ text: 'Beta', pageNumber: 2 }] },
      ].map((payload) => writeFile(path.join(dir, `${payload.documentId}.json`), JSON.stringify(payload))),
    );

    const source = new LocalDemoChunkSource();
    const catalog = await source.listDemoMaterials();
    const combined = await source.getCombinedChunks('class-1', ['doc-2', 'doc-1']);

    expect(catalog.map((material) => material.id)).toEqual(['doc-1', 'doc-2']);
    expect(combined.chunks.map((chunk) => [chunk.documentId, chunk.text])).toEqual([
      ['doc-2', 'Beta'],
      ['doc-1', 'Alpha'],
    ]);
    expect(combined.sourceMetadata).toEqual([
      expect.objectContaining({ documentId: 'doc-2', includedChunks: 1 }),
      expect.objectContaining({ documentId: 'doc-1', includedChunks: 1 }),
    ]);
  });
});

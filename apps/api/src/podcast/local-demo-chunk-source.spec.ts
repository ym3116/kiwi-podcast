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
    const result = await source.getChunks('class-fallback', 'doc-1');

    expect(result).toMatchObject({
      classId: 'class-1',
      documentId: 'doc-1',
      documentName: 'Loops',
      chunks: [{ text: 'First chunk', pageNumber: '2' }],
    });
  });

  it('throws for missing demo chunk files', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'kiwi-podcast-chunks-'));
    process.env.PODCAST_DEMO_CHUNKS_DIR = dir;
    const source = new LocalDemoChunkSource();

    await expect(source.getChunks('class-1', 'missing')).rejects.toThrow(
      'Demo chunk file not found',
    );
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
});

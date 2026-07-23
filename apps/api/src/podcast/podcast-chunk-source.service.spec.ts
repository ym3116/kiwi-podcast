import { describe, expect, it, vi } from 'vitest';
import { KiwiDocumentChunkSource } from './kiwi-document-chunk-source';
import { LocalDemoChunkSource } from './local-demo-chunk-source';
import {
  PodcastChunkSourceService,
  SIMULATOR_ACCESS_TOKEN,
} from './podcast-chunk-source.service';

describe('PodcastChunkSourceService', () => {
  it('routes only the exact simulator token to local fixtures', async () => {
    const local = { listMaterials: vi.fn().mockResolvedValue([{ id: 'local' }]) };
    const kiwi = { listMaterials: vi.fn().mockResolvedValue([{ id: 'live' }]) };
    const source = new PodcastChunkSourceService(
      local as unknown as LocalDemoChunkSource,
      kiwi as unknown as KiwiDocumentChunkSource,
    );

    await expect(source.listMaterials('class-1', SIMULATOR_ACCESS_TOKEN)).resolves.toEqual([
      { id: 'local' },
    ]);
    await expect(source.listMaterials('class-1', 'simulated-kiwi-app-token-extra')).resolves.toEqual([
      { id: 'live' },
    ]);
    await expect(source.listMaterials('class-1', 'real-token')).resolves.toEqual([
      { id: 'live' },
    ]);

    expect(local.listMaterials).toHaveBeenCalledTimes(1);
    expect(kiwi.listMaterials).toHaveBeenCalledTimes(2);
  });
});

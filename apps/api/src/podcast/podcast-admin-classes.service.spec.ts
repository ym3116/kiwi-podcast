import { BadGatewayException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PodcastAdminClassesService } from './podcast-admin-classes.service';

describe('PodcastAdminClassesService', () => {
  it('combines Kiwi enablement with Podcast overrides, published counts, and activity', async () => {
    const kiwi = {
      readResource: vi.fn().mockResolvedValue({
        classes: [
          { id: 'class-global', metadata: { className: 'Machine Learning' } },
          { id: 'class-override', name: 'ICP' },
          { id: 'class-disabled', className: 'Economics' },
        ],
      }),
      getClassAppScopes: vi.fn().mockImplementation(
        async (_token: string, _appSlug: string, classId: string) => ({
          effectiveScopes: classId === 'class-disabled' ? [] : ['podcast:manage'],
        }),
      ),
    };
    const prisma = {
      podcastClass: {
        findMany: vi.fn().mockResolvedValue([
          { classId: 'class-global', voiceDefaults: null, updatedAt: new Date('2026-08-19T10:00:00Z') },
          { classId: 'class-override', voiceDefaults: { host: {} }, updatedAt: new Date('2026-08-18T10:00:00Z') },
          { classId: 'class-disabled', voiceDefaults: { host: {} }, updatedAt: new Date('2026-08-20T10:00:00Z') },
        ]),
      },
      podcastEpisode: {
        groupBy: vi.fn().mockResolvedValue([
          { classId: 'class-global', _count: { _all: 8 }, _max: { updatedAt: new Date('2026-08-20T08:00:00Z') } },
          { classId: 'class-override', _count: { _all: 3 }, _max: { updatedAt: new Date('2026-08-18T12:00:00Z') } },
          { classId: 'class-disabled', _count: { _all: 9 }, _max: { updatedAt: new Date('2026-08-20T12:00:00Z') } },
        ]),
      },
      generationJob: {
        groupBy: vi.fn().mockResolvedValue([
          { classId: 'class-global', _max: { updatedAt: new Date('2026-08-20T09:00:00Z') } },
          { classId: 'class-override', _max: { updatedAt: new Date('2026-08-19T09:00:00Z') } },
        ]),
      },
    };
    const service = new PodcastAdminClassesService(prisma as never, kiwi as never);

    await expect(service.list('admin-token')).resolves.toEqual({
      classes: [
        {
          classId: 'class-global',
          className: 'Machine Learning',
          podcastEnabled: true,
          voiceSource: 'global',
          episodeCount: 8,
          lastActivityAt: '2026-08-20T09:00:00.000Z',
        },
        {
          classId: 'class-override',
          className: 'ICP',
          podcastEnabled: true,
          voiceSource: 'class',
          episodeCount: 3,
          lastActivityAt: '2026-08-19T09:00:00.000Z',
        },
        {
          classId: 'class-disabled',
          className: 'Economics',
          podcastEnabled: false,
          voiceSource: null,
          episodeCount: 0,
          lastActivityAt: null,
        },
      ],
    });
    expect(kiwi.readResource).toHaveBeenCalledWith('admin-token', 'kiwi://classes');
    expect(kiwi.getClassAppScopes).toHaveBeenCalledTimes(3);
    expect(kiwi.getClassAppScopes).toHaveBeenCalledWith(
      'admin-token',
      'podcasts',
      'class-global',
    );
    expect(prisma.podcastEpisode.groupBy).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ publishedJobId: { not: null } }),
    }));
  });

  it('deduplicates classes and falls back to an untitled label', async () => {
    const kiwi = {
      readResource: vi.fn().mockResolvedValue({
        classes: [{ id: 'class-1' }, { id: 'class-1', name: 'Duplicate' }, { id: '' }],
      }),
      getClassAppScopes: vi.fn().mockResolvedValue({ effectiveScopes: [] }),
    };
    const prisma = emptyPrisma();
    const service = new PodcastAdminClassesService(prisma as never, kiwi as never);

    const result = await service.list('admin-token');

    expect(result.classes).toHaveLength(1);
    expect(result.classes[0].className).toBe('Untitled class');
  });

  it('reports Kiwi class and enablement failures as gateway errors', async () => {
    const resourceFailure = new PodcastAdminClassesService(emptyPrisma() as never, {
      readResource: vi.fn().mockRejectedValue(new Error('offline')),
    } as never);
    await expect(resourceFailure.list('admin-token')).rejects.toBeInstanceOf(BadGatewayException);

    const scopeFailure = new PodcastAdminClassesService(emptyPrisma() as never, {
      readResource: vi.fn().mockResolvedValue({ classes: [{ id: 'class-1', name: 'Class' }] }),
      getClassAppScopes: vi.fn().mockRejectedValue(new Error('offline')),
    } as never);
    await expect(scopeFailure.list('admin-token')).rejects.toThrow(
      'Unable to determine Podcast status for class class-1',
    );
  });
});

function emptyPrisma() {
  return {
    podcastClass: { findMany: vi.fn().mockResolvedValue([]) },
    podcastEpisode: { groupBy: vi.fn().mockResolvedValue([]) },
    generationJob: { groupBy: vi.fn().mockResolvedValue([]) },
  };
}

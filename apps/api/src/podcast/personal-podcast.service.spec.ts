import { describe, expect, it, vi } from 'vitest';
import { PersonalPodcastService } from './personal-podcast.service';

describe('PersonalPodcastService audio ownership', () => {
  const record = {
    id: 'podcast-1',
    ownerUserId: 'student-1',
    status: 'ready',
    audioStorageKey: 'personal/student-1/podcast-1.mp3',
  };

  function service() {
    const prisma = { personalPodcast: { findUnique: vi.fn(async () => record) } };
    return new PersonalPodcastService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
  }

  it('returns an object key to the owner', async () => {
    await expect(service().audioStorageKey('podcast-1', 'student-1')).resolves.toBe(
      'personal/student-1/podcast-1.mp3',
    );
  });

  it('does not reveal another student audio object', async () => {
    await expect(service().audioStorageKey('podcast-1', 'student-2')).rejects.toMatchObject({
      status: 404,
    });
  });

  it('deletes owned MinIO audio before deleting the database row', async () => {
    const events: string[] = [];
    const prisma = {
      personalPodcast: {
        findFirst: vi.fn(async () => record),
        delete: vi.fn(async () => {
          events.push('database');
          return record;
        }),
      },
    };
    const audioStorage = {
      delete: vi.fn(async () => {
        events.push('storage');
      }),
    };
    const subject = new PersonalPodcastService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      audioStorage as never,
    );

    await expect(subject.delete('class-1', 'podcast-1', 'student-1')).resolves.toEqual({
      deleted: true,
      id: 'podcast-1',
    });
    expect(events).toEqual(['storage', 'database']);
    expect(prisma.personalPodcast.findFirst).toHaveBeenCalledWith({
      where: { id: 'podcast-1', classId: 'class-1', ownerUserId: 'student-1' },
    });
  });

  it('does not delete a podcast while generation is active', async () => {
    const prisma = {
      personalPodcast: {
        findFirst: vi.fn(async () => ({ ...record, status: 'generating_audio' })),
        delete: vi.fn(),
      },
    };
    const audioStorage = { delete: vi.fn() };
    const subject = new PersonalPodcastService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      audioStorage as never,
    );

    await expect(subject.delete('class-1', 'podcast-1', 'student-1')).rejects.toMatchObject({
      status: 409,
    });
    expect(audioStorage.delete).not.toHaveBeenCalled();
    expect(prisma.personalPodcast.delete).not.toHaveBeenCalled();
  });

  it('uses the current token for live material validation and background chunk retrieval', async () => {
    const now = new Date('2026-07-23T00:00:00.000Z');
    const created = {
      id: 'podcast-live',
      classId: 'class-1',
      ownerUserId: 'student-1',
      prompt: 'Explain the live lecture material',
      durationMinutes: 5,
      difficulty: 'intermediate',
      selectedMaterials: [],
      status: 'queued',
      progressPercent: 5,
      statusMessage: 'Waiting to start',
      title: null,
      summary: null,
      turns: null,
      audioStorageKey: null,
      errorMessage: null,
      startedAt: null,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    const prisma = {
      personalPodcast: {
        create: vi.fn(async ({ data }) => ({ ...created, ...data })),
        findUniqueOrThrow: vi.fn(async () => ({
          ...created,
          selectedMaterials: [{ id: 'doc-1' }],
        })),
        update: vi.fn(async () => created),
      },
    };
    const source = {
      listMaterials: vi.fn().mockResolvedValue([{
        id: 'doc-1',
        documentId: 'doc-1',
        documentName: 'Lecture.pdf',
        materialType: 'lecture',
        chunkCount: 1,
        preview: 'Live text',
      }]),
      getCombinedChunks: vi.fn().mockResolvedValue({
        classId: 'class-1',
        documentId: 'doc-1',
        documentName: 'Lecture.pdf',
        chunks: [{ text: 'Live text' }],
        sourceMetadata: [],
      }),
    };
    const scripts = {
      generatePersonal: vi.fn().mockResolvedValue({
        title: 'Live podcast',
        summary: 'Summary',
        turns: [{ speaker: 'HOST_A', text: 'Hello.' }],
      }),
    };
    const audio = { produce: vi.fn().mockResolvedValue(Buffer.from([1])) };
    const storage = {
      upload: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    };
    const subject = new PersonalPodcastService(
      prisma as never,
      source as never,
      scripts as never,
      audio as never,
      storage as never,
    );

    await subject.create('class-1', {
      ownerUserId: 'student-1',
      prompt: 'Explain the live lecture material',
      materialIds: ['doc-1'],
      durationMinutes: 5,
      difficulty: 'intermediate',
    }, 'fresh-token');

    expect(source.listMaterials).toHaveBeenCalledWith('class-1', 'fresh-token');
    await vi.waitFor(() => {
      expect(source.getCombinedChunks).toHaveBeenCalledWith(
        'class-1',
        ['doc-1'],
        'fresh-token',
      );
    });
    expect(prisma.personalPodcast.create.mock.calls[0][0].data).not.toHaveProperty('accessToken');
    expect(prisma.personalPodcast.create.mock.calls[0][0].data.selectedMaterials).toEqual([
      expect.objectContaining({ documentId: 'doc-1', preview: '' }),
    ]);
    expect(JSON.stringify(prisma.personalPodcast.create.mock.calls[0][0].data)).not.toContain(
      'Live text',
    );
  });

  it('maps a missing Kiwi chunk scope to a clear forbidden response', async () => {
    const subject = new PersonalPodcastService(
      {} as never,
      {
        listMaterials: vi.fn().mockRejectedValue(
          new Error('Kiwi denied document chunk access: Missing required scope'),
        ),
      } as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(subject.listMaterials('class-1', 'token')).rejects.toMatchObject({
      status: 403,
      response: { error: 'Kiwi denied document chunk access: Missing required scope' },
    });
  });
});

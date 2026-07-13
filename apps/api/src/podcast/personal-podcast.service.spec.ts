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
});

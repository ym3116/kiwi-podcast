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
});

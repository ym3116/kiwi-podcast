import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AudioStorageService } from '../storage/audio-storage.service';
import {
  PodcastAccessAuthService,
  PodcastPrincipal,
} from './podcast-access-auth.service';
import { PodcastController } from './podcast.controller';
import { PersonalPodcastService } from './personal-podcast.service';
import { PodcastService } from './podcast.service';

describe('PodcastController authorization boundaries', () => {
  it('uses the verified principal instead of a client-supplied owner on create', async () => {
    const { controller, personal } = subject();
    const input = {
      prompt: 'Explain the current lecture',
      materialIds: ['doc-1'],
      durationMinutes: 5 as const,
      difficulty: 'intermediate' as const,
      ownerUserId: 'spoofed-user',
    };

    await controller.createPersonalPodcast('class-1', input, 'Bearer valid-token');

    expect(personal.create).toHaveBeenCalledWith(
      'class-1',
      'user-1',
      input,
      'valid-token',
    );
  });

  it('lists and reads only the verified principal owner', async () => {
    const { controller, personal } = subject();

    await controller.listPersonalPodcasts('class-1', 'Bearer valid-token');
    await controller.getPersonalPodcast('class-1', 'podcast-1', 'Bearer valid-token');

    expect(personal.list).toHaveBeenCalledWith('class-1', 'user-1');
    expect(personal.get).toHaveBeenCalledWith('class-1', 'podcast-1', 'user-1');
  });

  it('uses the class when resolving published audio', async () => {
    const { controller, podcasts, auth } = subject();
    const response = { status: vi.fn().mockReturnThis(), json: vi.fn() };

    await controller.getAudio(
      'class-1',
      'episode-1',
      'Bearer valid-token',
      undefined,
      response,
    );

    expect(auth.authorize).toHaveBeenCalledWith('class-1', 'Bearer valid-token');
    expect(podcasts.getAudioStorageKey).toHaveBeenCalledWith('class-1', 'episode-1');
    expect(response.status).toHaveBeenCalledWith(404);
  });

  it('derives personal audio ownership from the verified token', async () => {
    const { controller, personal } = subject();
    personal.audioStorageKey.mockRejectedValueOnce(new Error('stop before streaming'));

    await expect(
      controller.getPersonalAudio(
        'class-1',
        'podcast-1',
        'Bearer valid-token',
        undefined,
        {},
      ),
    ).rejects.toThrow('stop before streaming');
    expect(personal.audioStorageKey).toHaveBeenCalledWith(
      'class-1',
      'podcast-1',
      'user-1',
    );
  });

  it('does not let the public Simulator principal read live class data', async () => {
    const { controller, auth, podcasts } = subject();
    auth.authorize.mockResolvedValueOnce({
      ...(await auth.authorize('class-1', 'Bearer valid-token')),
      mode: 'simulator',
    });

    await expect(
      controller.getClassPodcast('class-1', 'Bearer simulated-kiwi-app-token'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(podcasts.getClassPodcast).not.toHaveBeenCalled();
  });
});

function subject() {
  const principal: PodcastPrincipal = {
    userId: 'user-1',
    classId: 'class-1',
    role: 'student',
    scopes: new Set(['class:info:read', 'class:materials:chunks:read']),
    accessToken: 'valid-token',
    mode: 'live',
  };
  const auth = { authorize: vi.fn().mockResolvedValue(principal) };
  const podcasts = {
    getClassPodcast: vi.fn(),
    getAudioStorageKey: vi.fn().mockResolvedValue(null),
  };
  const personal = {
    create: vi.fn().mockResolvedValue({}),
    list: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue({}),
    audioStorageKey: vi.fn().mockResolvedValue('personal/user-1/podcast-1.mp3'),
  };
  const controller = new PodcastController(
    podcasts as unknown as PodcastService,
    personal as unknown as PersonalPodcastService,
    {} as AudioStorageService,
    auth as unknown as PodcastAccessAuthService,
  );
  return { controller, auth, personal, podcasts };
}

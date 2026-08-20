import { HttpException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PodcastGlobalSettingsService } from './podcast-global-settings.service';
import { PodcastVoiceSettingsService } from './podcast-voice-settings.service';

describe('PodcastGlobalSettingsService', () => {
  it('returns environment defaults when no saved row exists', async () => {
    const prisma = database();
    const voices = voiceService();
    const service = new PodcastGlobalSettingsService(prisma as never, voices);

    await expect(service.getState()).resolves.toEqual({
      defaults: settings('alloy', 'echo'),
      source: 'environment',
      updatedAt: null,
    });
  });

  it('returns a valid saved singleton with its timestamp', async () => {
    const prisma = database();
    const updatedAt = new Date('2026-08-06T04:00:00.000Z');
    prisma.podcastGlobalSettings.findUnique.mockResolvedValue({
      key: 'global',
      voiceDefaults: settings('nova', 'onyx'),
      updatedByUserId: 'admin-1',
      createdAt: updatedAt,
      updatedAt,
    });
    const service = new PodcastGlobalSettingsService(prisma as never, voiceService());

    await expect(service.getState()).resolves.toEqual({
      defaults: settings('nova', 'onyx'),
      source: 'saved',
      updatedAt: updatedAt.toISOString(),
    });
  });

  it('updates the singleton and invalidates only episodes whose inherited voice changes', async () => {
    const prisma = database();
    const updatedAt = new Date('2026-08-06T05:00:00.000Z');
    prisma.podcastClass.findMany.mockResolvedValue([
      {
        voiceDefaults: null,
        documents: [
          { episode: { id: 'inherits-both', voiceOverrides: null } },
          { episode: { id: 'overrides-both', voiceOverrides: settings('alloy', 'echo') } },
          { episode: { id: 'inherits-speaker', voiceOverrides: { host: settings('alloy', 'echo').host } } },
        ],
      },
    ]);
    prisma.podcastGlobalSettings.upsert.mockResolvedValue({ updatedAt });
    const service = new PodcastGlobalSettingsService(prisma as never, voiceService());

    const result = await service.update(settings('nova', 'onyx'), 'admin-1');

    expect(prisma.podcastClass.findMany).toHaveBeenCalledWith({
      where: { voiceDefaults: { equals: expect.anything() } },
      include: { documents: { include: { episode: true } } },
    });
    expect(prisma.podcastEpisode.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['inherits-both', 'inherits-speaker'] } },
      data: { draftRevision: { increment: 1 } },
    });
    expect(prisma.podcastGlobalSettings.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { key: 'global' },
      create: expect.objectContaining({ updatedByUserId: 'admin-1' }),
      update: expect.objectContaining({ updatedByUserId: 'admin-1' }),
    }));
    expect(result).toEqual({
      defaults: settings('nova', 'onyx'),
      source: 'saved',
      updatedAt: updatedAt.toISOString(),
    });
    expect(prisma.podcastEpisode.updateMany.mock.calls[0][0].data).not.toHaveProperty(
      'publishedJobId',
    );
  });

  it('uses the shared validation rules for updates and previews', async () => {
    const prisma = database();
    const voices = voiceService();
    const service = new PodcastGlobalSettingsService(prisma as never, voices);

    await expect(service.update({ host: {}, speaker: {} }, 'admin-1')).rejects.toBeInstanceOf(
      HttpException,
    );
    await service.preview(settings('alloy', 'echo').host);
    expect((voices as any).tts.preview).toHaveBeenCalled();
  });
});

function database() {
  const prisma = {
    podcastGlobalSettings: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn(),
    },
    podcastClass: { findMany: vi.fn().mockResolvedValue([]) },
    podcastEpisode: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    $transaction: vi.fn(async (operations: Array<Promise<unknown>>) => Promise.all(operations)),
  };
  return prisma;
}

function voiceService() {
  const tts = {
    defaultVoiceSettings: vi.fn(() => settings('alloy', 'echo')),
    preview: vi.fn().mockResolvedValue(Buffer.from('wav')),
  };
  const service = new PodcastVoiceSettingsService(tts as never);
  Object.assign(service, { tts });
  return service;
}

function settings(hostVoice: 'alloy' | 'nova', speakerVoice: 'echo' | 'onyx') {
  return {
    host: { mode: 'preset' as const, voice: hostVoice, description: 'Host voice', seed: 1, referenceText: 'Hello there.' },
    speaker: { mode: 'preset' as const, voice: speakerVoice, description: 'Speaker voice', seed: 2, referenceText: 'Nice to meet you.' },
  };
}

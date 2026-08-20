import { describe, expect, it, vi } from 'vitest';
import { PodcastAdminController } from './podcast-admin.controller';

describe('PodcastAdminController', () => {
  it('protects and returns the global defaults', async () => {
    const auth = { authorize: vi.fn().mockResolvedValue({ userId: 'admin-1' }) };
    const state = { defaults: {}, source: 'saved', updatedAt: null };
    const settings = { getState: vi.fn().mockResolvedValue(state) };
    const controller = new PodcastAdminController(auth as never, settings as never);

    await expect(controller.getDefaults('Bearer token')).resolves.toBe(state);
    expect(auth.authorize).toHaveBeenCalledWith('Bearer token');
  });

  it('records the verified admin identity when saving', async () => {
    const auth = { authorize: vi.fn().mockResolvedValue({ userId: 'admin-1' }) };
    const settings = { update: vi.fn().mockResolvedValue({ source: 'saved' }) };
    const controller = new PodcastAdminController(auth as never, settings as never);
    const input = { host: {}, speaker: {} };

    await controller.updateDefaults(input, 'Bearer token');

    expect(settings.update).toHaveBeenCalledWith(input, 'admin-1');
  });

  it('streams a protected no-store WAV preview', async () => {
    const auth = { authorize: vi.fn().mockResolvedValue({ userId: 'admin-1' }) };
    const wav = Buffer.from('wav');
    const settings = { preview: vi.fn().mockResolvedValue(wav) };
    const response = { setHeader: vi.fn(), send: vi.fn() };
    const controller = new PodcastAdminController(auth as never, settings as never);

    await controller.voicePreview({ voice: 'nova' }, 'Bearer token', response);

    expect(auth.authorize).toHaveBeenCalledWith('Bearer token');
    expect(response.setHeader).toHaveBeenCalledWith('Content-Type', 'audio/wav');
    expect(response.setHeader).toHaveBeenCalledWith('Cache-Control', 'private, no-store');
    expect(response.send).toHaveBeenCalledWith(wav);
  });
});

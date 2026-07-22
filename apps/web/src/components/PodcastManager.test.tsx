import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { previewManagedVoice } from '../api/podcastApi';
import { PodcastManagementState } from '../types/podcast';
import { PodcastManager } from './PodcastManager';

vi.mock('../api/podcastApi', () => ({
  deleteManagedEpisode: vi.fn(),
  fetchManagedPreviewAudio: vi.fn().mockResolvedValue(new Blob(['episode'])),
  generateManagedDraft: vi.fn(),
  previewManagedVoice: vi.fn().mockResolvedValue(new Blob(['voice'])),
  publishManagedEpisode: vi.fn(),
  renderManagedEpisode: vi.fn(),
  updateManagedEpisode: vi.fn(),
  updatePodcastDefaults: vi.fn(),
}));

const audioInstances: FakeAudio[] = [];

describe('PodcastManager', () => {
  beforeEach(() => {
    audioInstances.length = 0;
    vi.stubGlobal('Audio', vi.fn((src: string) => {
      const audio = new FakeAudio(src);
      audioInstances.push(audio);
      return audio;
    }));
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => `blob:preview-${audioInstances.length}`),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('shows only fields relevant to the selected voice mode and removes target minutes', async () => {
    const user = userEvent.setup();
    renderManager();

    expect(screen.getAllByLabelText('Preset voice')).toHaveLength(4);
    expect(screen.queryByLabelText('Voice description')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Custom seed')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Target minutes')).not.toBeInTheDocument();
    expect(screen.getAllByText('Published · 1:35').length).toBeGreaterThan(0);

    await user.selectOptions(screen.getAllByLabelText('Mode')[0], 'custom');
    expect(screen.getByLabelText('Voice description')).toBeInTheDocument();
    expect(screen.getByLabelText(/Custom seed/)).toBeInTheDocument();
    expect(screen.getAllByLabelText('Preset voice')).toHaveLength(3);
  });

  it('uses one toggleable preview player and stops it before another preview starts', async () => {
    const user = userEvent.setup();
    renderManager();

    await user.click(screen.getAllByRole('button', { name: 'Preview' })[0]);
    await screen.findByRole('button', { name: 'Stop preview' });
    expect(audioInstances).toHaveLength(1);
    expect(audioInstances[0].play).toHaveBeenCalledOnce();

    await user.click(screen.getByRole('button', { name: 'Stop preview' }));
    expect(audioInstances[0].pause).toHaveBeenCalledOnce();
    expect(audioInstances).toHaveLength(1);

    await user.click(screen.getAllByRole('button', { name: 'Preview' })[0]);
    await waitFor(() => expect(audioInstances).toHaveLength(2));
    await user.click(screen.getAllByRole('button', { name: 'Preview' })[0]);
    await waitFor(() => expect(audioInstances).toHaveLength(3));
    expect(audioInstances[1].pause).toHaveBeenCalledOnce();
    expect(previewManagedVoice).toHaveBeenCalledTimes(3);
  });
});

function renderManager() {
  return render(
    <PodcastManager
      data={managementState()}
      token="token"
      onRefresh={vi.fn()}
      onPublished={vi.fn()}
      onPreviewStart={vi.fn()}
      previewStopSignal={0}
    />,
  );
}

function managementState(): PodcastManagementState {
  const host = { mode: 'preset' as const, voice: 'nova' as const, description: 'Warm host', seed: 505, referenceText: 'Welcome.' };
  const speaker = { mode: 'preset' as const, voice: 'onyx' as const, description: 'Clear speaker', seed: 404, referenceText: 'Hello.' };
  return {
    classId: 'class-1',
    className: 'Test Class',
    defaults: { host, speaker },
    episodes: [{
      documentId: 'doc-1', documentName: 'Lecture one', materialType: 'lecture', title: 'Episode one',
      draft: { summary: 'Summary', turns: [{ speaker: 'HOST_A', text: 'Welcome.' }], revision: 1 },
      voiceOverrides: { host: { ...host }, speaker: { ...speaker } },
      effectiveVoices: { host, speaker },
      published: { jobId: 'job-1', generatedAt: '2026-07-22T00:00:00Z', durationSeconds: 95, audioUrl: '/audio' },
      latestRender: { jobId: 'job-1', status: 'ready', progressPercent: 100, statusMessage: 'Preview ready', draftRevision: 1, durationSeconds: 95, previewAvailable: true },
    }],
  };
}

class FakeAudio {
  currentTime = 0;
  readonly play = vi.fn().mockResolvedValue(undefined);
  readonly pause = vi.fn();
  private readonly listeners = new Map<string, EventListener>();

  constructor(readonly src: string) {}

  addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    if (typeof listener === 'function') this.listeners.set(type, listener);
  }
}

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

const generatedEpisode = {
  id: 'episode-49d054f2-2a9c-44f1-9a9f-43d67d77a01a',
  documentId: '49d054f2-2a9c-44f1-9a9f-43d67d77a01a',
  title: 'Understanding Lasso Regression',
  lectureNumber: 1,
  documentName: '14_regularization_2',
  materialType: 'class materials',
  durationLabel: '15 min',
  script: 'HOST_A: Welcome to Lasso regression.\n\nHOST_B: Lasso encourages sparse models.',
  status: 'ready' as const,
  audioUrl: 'http://localhost:8010/api/podcast/audio/episode-49d054f2-2a9c-44f1-9a9f-43d67d77a01a',
};

const personalPodcast = {
  id: 'personal-1',
  classId: '1ef1daa0-6f00-4c52-b13f-fa85b65b3e31',
  ownerUserId: 'sim-user-1',
  prompt: 'Explain regularization for the exam',
  title: 'Regularization review',
  summary: 'A focused review made for the exam.',
  durationMinutes: 5,
  difficulty: 'intermediate' as const,
  status: 'ready' as const,
  progressPercent: 100,
  statusMessage: 'Ready',
  selectedMaterials: [{
    id: 'material-1',
    documentId: 'doc-1',
    documentName: 'Regularization notes',
    materialType: 'notes',
    chunkCount: 3,
    preview: 'Lasso and ridge regression',
  }],
  turns: [
    { speaker: 'HOST_A' as const, text: 'Welcome to your regularization review.' },
    { speaker: 'HOST_B' as const, text: 'Let’s compare Lasso and ridge.' },
  ],
  audioUrl: 'http://localhost:8010/api/podcast/my-podcasts/personal-1/audio',
  createdAt: '2026-07-13T00:00:00.000Z',
  updatedAt: '2026-07-13T00:00:00.000Z',
};

describe('App', () => {
  beforeEach(() => {
    (window as Window & { __KIWI_PODCAST_FORCE_MODE__?: 'simulator' })
      .__KIWI_PODCAST_FORCE_MODE__ = 'simulator';
    vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(window.HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ job: { ...generatedEpisode, episodeId: generatedEpisode.id, classId: '1ef1daa0-6f00-4c52-b13f-fa85b65b3e31' }, episode: generatedEpisode }),
      })),
    );
  });

  afterEach(() => {
    delete (window as Window & { __KIWI_PODCAST_FORCE_MODE__?: string })
      .__KIWI_PODCAST_FORCE_MODE__;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders simulator podcast episodes', async () => {
    render(<App />);

    expect(await screen.findByText('Regularization - Podcast')).toBeInTheDocument();
    expect(screen.getByText('Lecture 14 - Regularization 2')).toBeInTheDocument();
  });

  it('opens an episode detail and toggles play state', async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByText('Lecture 14 - Regularization 2');
    await user.click(screen.getByText('Lecture 14 - Regularization 2'));

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Lecture 14 - Regularization 2' })).toBeInTheDocument());
    const generate = screen.getByRole('button', { name: 'Generate audio' });
    expect(generate).toBeDefined();
    if (!generate) return;
    await user.click(generate);
    expect(screen.getAllByRole('button', { name: 'Pause' }).length).toBeGreaterThan(0);
  });

  it('uses audio metadata for transport controls without reopening episode detail', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    await screen.findByText('Lecture 14 - Regularization 2');
    await user.click(screen.getByText('Lecture 14 - Regularization 2'));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Lecture 14 - Regularization 2' })).toBeInTheDocument());
    const generate = screen.getByRole('button', { name: 'Generate audio' });
    expect(generate).toBeDefined();
    if (!generate) return;
    await user.click(generate);

    await user.click(screen.getByRole('button', { name: 'Back to Class Podcast' }));

    expect(screen.getByRole('heading', { name: 'Episodes' })).toBeInTheDocument();
    const audio = container.querySelector('audio');
    expect(audio).toBeTruthy();
    expect(container.querySelectorAll('audio')).toHaveLength(1);
    if (!audio) return;

    Object.defineProperty(audio, 'duration', { configurable: true, value: 124 });
    fireEvent.durationChange(audio);
    expect(screen.getByLabelText('Now playing')).toHaveTextContent('0:00 / 2:04');

    fireEvent.change(screen.getByLabelText('Playback progress'), { target: { value: '30' } });
    expect(audio.currentTime).toBe(30);

    await user.click(screen.getByRole('button', { name: 'Forward 15 seconds' }));
    await user.click(screen.getByRole('button', { name: 'Forward 15 seconds' }));
    expect(audio.currentTime).toBe(60);

    await user.click(screen.getByRole('button', { name: 'Pause' }));
    expect(screen.getByRole('heading', { name: 'Episodes' })).toBeInTheDocument();
  });

  it('shows the real audio duration on the episode page after metadata loads', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    await screen.findByText('Lecture 14 - Regularization 2');
    await user.click(screen.getByText('Lecture 14 - Regularization 2'));
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Lecture 14 - Regularization 2' })).toBeInTheDocument(),
    );
    const generate = screen.getByRole('button', { name: 'Generate audio' });
    expect(generate).toBeDefined();
    if (!generate) return;
    await user.click(generate);

    const audio = container.querySelector('audio');
    expect(audio).toBeTruthy();
    if (!audio) return;

    Object.defineProperty(audio, 'duration', { configurable: true, value: 107 });
    fireEvent.loadedMetadata(audio);

    expect(screen.getByText('1:47')).toBeInTheDocument();
    expect(screen.queryByText('15 min')).not.toBeInTheDocument();
  });

  it('opens personal scripts and keeps their playback global while navigating', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/creator/materials')) {
        return { ok: true, json: async () => ({ materials: [] }) };
      }
      return { ok: true, json: async () => ({ podcasts: [personalPodcast] }) };
    }));
    const { container } = render(<App />);

    await screen.findByText('Regularization - Podcast');
    await user.click(screen.getByRole('tab', { name: 'My Podcasts' }));
    const personalTitle = (await screen.findAllByText('Regularization review')).at(-1);
    expect(personalTitle).toBeDefined();
    if (!personalTitle) return;
    await user.click(personalTitle);

    expect(screen.getByRole('heading', { name: 'Script' })).toBeInTheDocument();
    expect(screen.getByText('Welcome to your regularization review.')).toBeInTheDocument();
    expect(screen.getByText('Host A')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Play' }));
    expect(screen.getByLabelText('Now playing')).toHaveTextContent('Regularization review');
    expect(container.querySelectorAll('audio')).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Back to My Podcasts' }));
    await user.click(screen.getByRole('tab', { name: 'Class Podcast' }));
    expect(screen.getByLabelText('Now playing')).toHaveTextContent('Regularization review');

    await user.click(screen.getByRole('button', { name: 'Create your podcast' }));
    expect(screen.getByLabelText('Now playing')).toHaveTextContent('Regularization review');
  });
});

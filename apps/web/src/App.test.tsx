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
    const generate = screen.getAllByRole('button', { name: 'Generate' }).at(-1);
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
    const generate = screen.getAllByRole('button', { name: 'Generate' }).at(-1);
    expect(generate).toBeDefined();
    if (!generate) return;
    await user.click(generate);

    await user.click(screen.getByRole('button', { name: 'Episodes' }));

    expect(screen.getByRole('heading', { name: 'Episodes' })).toBeInTheDocument();
    const audio = container.querySelector('audio');
    expect(audio).toBeTruthy();
    if (!audio) return;

    Object.defineProperty(audio, 'duration', { configurable: true, value: 124 });
    fireEvent.durationChange(audio);
    expect(screen.getByLabelText('Now playing')).toHaveTextContent('0:00 / 2:04');

    fireEvent.input(screen.getByLabelText('Playback progress'), { target: { value: '30' } });
    expect(audio.currentTime).toBe(30);

    await user.click(screen.getByRole('button', { name: 'Pause' }));
    expect(screen.getByRole('heading', { name: 'Episodes' })).toBeInTheDocument();
  });
});

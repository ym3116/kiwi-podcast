import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PersonalPodcast } from '../types/podcast';
import { MyPodcasts } from './MyPodcasts';

const podcast: PersonalPodcast = {
  id: 'podcast-1',
  classId: 'class-1',
  prompt: 'Explain regularization for the exam',
  title: 'Regularization review',
  summary: 'A review',
  durationMinutes: 5,
  difficulty: 'intermediate',
  status: 'ready',
  progressPercent: 100,
  statusMessage: 'Ready',
  selectedMaterials: [],
  audioUrl: 'http://localhost/audio.mp3',
  createdAt: '2026-07-13T00:00:00.000Z',
  updatedAt: '2026-07-13T00:00:00.000Z',
};

describe('MyPodcasts deletion', () => {
  it('uses an in-app confirmation before deleting', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn(async () => undefined);
    render(
      <MyPodcasts
        podcasts={[podcast]}
        loading={false}
        playingKey={null}
        onCreate={vi.fn()}
        onOpen={vi.fn()}
        onPlay={vi.fn()}
        onRetry={vi.fn()}
        onDelete={onDelete}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Delete Regularization review' }));
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByText('Delete this podcast and its audio permanently?')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Delete permanently' }));
    expect(onDelete).toHaveBeenCalledWith(podcast);
  });
});

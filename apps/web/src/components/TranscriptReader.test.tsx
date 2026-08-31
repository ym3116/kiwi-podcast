import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TranscriptReader } from './TranscriptReader';

const turns = [
  { speaker: 'Host A', text: 'First line.', startSeconds: 0, endSeconds: 10 },
  { speaker: 'Host B', text: 'Second line.', startSeconds: 10, endSeconds: 20 },
  { speaker: 'Host A', text: 'Third line.', startSeconds: 20, endSeconds: 30 },
];

function props() {
  return {
    itemKey: 'class:episode-1',
    turns,
    currentTime: 5,
    duration: 30,
    isCurrentTrack: true,
    mode: 'live' as const,
    onPause: vi.fn(),
    onSeek: vi.fn(),
    onAsk: vi.fn(),
  };
}

describe('TranscriptReader', () => {
  it('tracks playback while preserving a separate selected line', async () => {
    const initial = props();
    const { rerender } = render(<TranscriptReader {...initial} />);

    expect(screen.getByText('First line.').closest('article')).toHaveAttribute('data-active', 'true');
    await userEvent.click(screen.getByText('Third line.'));
    expect(screen.getByText('Third line.').closest('article')).toHaveAttribute('data-selected', 'true');

    rerender(<TranscriptReader {...initial} currentTime={15} />);
    expect(screen.getByText('Second line.').closest('article')).toHaveAttribute('data-active', 'true');
    expect(screen.getByText('Third line.').closest('article')).toHaveAttribute('data-selected', 'true');
  });

  it('pauses follow mode after manual scrolling and restores it with Locate', async () => {
    render(<TranscriptReader {...props()} />);
    const viewport = screen.getByRole('region', { name: 'Synchronized podcast transcript' });

    fireEvent.wheel(viewport);
    expect(screen.getByText('Follow paused')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Locate current line' }));
    expect(screen.getByText('Following playback')).toBeInTheDocument();
  });

  it('asks about any line, pauses playback, and shows the live chat handoff', async () => {
    const input = props();
    render(<TranscriptReader {...input} />);

    await userEvent.click(screen.getByRole('button', { name: 'Ask Kiwi about Host A at 0:20' }));

    expect(input.onPause).toHaveBeenCalledTimes(1);
    expect(input.onAsk).toHaveBeenCalledWith(expect.objectContaining({
      index: 2,
      previous: expect.objectContaining({ text: 'Second line.' }),
      line: expect.objectContaining({ text: 'Third line.' }),
    }));
    expect(screen.getByRole('status')).toHaveTextContent(
      'Kiwi Chat has context for Host A at 0:20',
    );
  });

  it('does not claim Kiwi Chat was updated in Simulator mode', async () => {
    render(<TranscriptReader {...props()} mode="simulator" />);
    await userEvent.click(screen.getByRole('button', { name: 'Ask about current line' }));
    expect(screen.getByRole('status')).toHaveTextContent('Kiwi Chat is unavailable in Simulator mode');
  });
});

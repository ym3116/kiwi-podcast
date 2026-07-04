import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from './App';

describe('App', () => {
  beforeEach(() => {
    (window as Window & { __KIWI_PODCAST_FORCE_MODE__?: 'simulator' })
      .__KIWI_PODCAST_FORCE_MODE__ = 'simulator';
  });

  afterEach(() => {
    delete (window as Window & { __KIWI_PODCAST_FORCE_MODE__?: string })
      .__KIWI_PODCAST_FORCE_MODE__;
  });

  it('renders simulator podcast episodes', async () => {
    render(<App />);

    expect(await screen.findByText('Introduction to Computer Programming - Podcast')).toBeInTheDocument();
    expect(screen.getByText('Lecture 1 - Python basics')).toBeInTheDocument();
  });

  it('opens an episode detail and toggles play state', async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByText('Lecture 1 - Python basics');
    await user.click(screen.getByText('Lecture 2 - Conditionals and loops'));

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Lecture 2 - Conditionals and loops' })).toBeInTheDocument());
    const play = screen.getByRole('button', { name: 'Play' });
    await user.click(play);
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
  });
});

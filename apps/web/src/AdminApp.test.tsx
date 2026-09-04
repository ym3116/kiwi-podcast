import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminApp } from './AdminApp';

const savedState = {
  defaults: {
    host: { mode: 'preset' as const, voice: 'nova' as const, description: 'Host voice', seed: 1, referenceText: 'Hello.' },
    speaker: { mode: 'preset' as const, voice: 'onyx' as const, description: 'Speaker voice', seed: 2, referenceText: 'Welcome.' },
  },
  source: 'saved' as const,
  updatedAt: '2026-08-06T05:00:00.000Z',
};

describe('AdminApp', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/admin');
    vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(window.HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
  });

  afterEach(() => {
    delete (window as Window & { __KIWI_PODCAST_FORCE_MODE__?: string })
      .__KIWI_PODCAST_FORCE_MODE__;
    window.history.replaceState(null, '', '/');
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders the admin shell and saves global defaults in Simulator mode', async () => {
    (window as Window & { __KIWI_PODCAST_FORCE_MODE__?: 'simulator' })
      .__KIWI_PODCAST_FORCE_MODE__ = 'simulator';
    const user = userEvent.setup();
    render(<AdminApp />);

    expect(await screen.findByRole('heading', { name: 'Global voice defaults' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Global Defaults/i })).toHaveAttribute('aria-current', 'page');
    expect(await screen.findByText('Environment defaults')).toBeInTheDocument();

    const presetSelectors = screen.getAllByLabelText('Preset voice');
    await user.selectOptions(presetSelectors[0], 'shimmer');
    await user.click(screen.getByRole('button', { name: 'Save global defaults' }));

    expect(await screen.findByText('Saved for this Simulator session.')).toBeInTheDocument();
    expect(screen.getByText('Saved global settings')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Preview' })[0]).toBeDisabled();
  });

  it('shows representative class podcast data in Simulator mode', async () => {
    (window as Window & { __KIWI_PODCAST_FORCE_MODE__?: 'simulator' })
      .__KIWI_PODCAST_FORCE_MODE__ = 'simulator';
    const user = userEvent.setup();
    render(<AdminApp />);

    await user.click(screen.getByRole('button', { name: /All Classes/i }));

    expect(await screen.findByRole('heading', { name: 'All classes' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /All Classes/i })).toHaveAttribute('aria-current', 'page');
    expect(await screen.findByRole('table', { name: 'All class podcasts' })).toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: 'Machine Learning' })).toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: 'ICP' })).toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: 'Economics' })).toBeInTheDocument();
    expect(screen.getByText('Class override')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
  });

  it('loads the class overview with the Kiwi admin bearer token', async () => {
    (window as Window & { __KIWI_PODCAST_FORCE_MODE__?: 'live' })
      .__KIWI_PODCAST_FORCE_MODE__ = 'live';
    const classesState = {
      classes: [{
        classId: 'class-1',
        className: 'Machine Learning',
        podcastEnabled: true,
        voiceSource: 'global',
        episodeCount: 8,
        lastActivityAt: '2026-08-20T08:00:00.000Z',
      }],
    };
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(classesState));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<AdminApp />);
    await user.click(screen.getByRole('button', { name: /All Classes/i }));
    sendLiveContext();

    expect(await screen.findByRole('rowheader', { name: 'Machine Learning' })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:8010/api/podcast/admin/classes', {
      headers: { Authorization: 'Bearer admin-token' },
    });
    expect(screen.getByText('1 enabled of 1 visible classes')).toBeInTheDocument();
  });

  it('loads and saves defaults with the classless Kiwi bearer token', async () => {
    (window as Window & { __KIWI_PODCAST_FORCE_MODE__?: 'live' })
      .__KIWI_PODCAST_FORCE_MODE__ = 'live';
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(savedState))
      .mockResolvedValueOnce(jsonResponse({
        ...savedState,
        defaults: { ...savedState.defaults, host: { ...savedState.defaults.host, voice: 'alloy' } },
      }));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<AdminApp />);
    sendLiveContext();

    expect(await screen.findByText('Saved global settings')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenNthCalledWith(1, 'http://localhost:8010/api/podcast/admin/defaults', {
      headers: { Authorization: 'Bearer admin-token' },
    });

    await user.selectOptions(screen.getAllByLabelText('Preset voice')[0], 'alloy');
    await user.click(screen.getByRole('button', { name: 'Save global defaults' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      method: 'PATCH',
      headers: { Authorization: 'Bearer admin-token', 'Content-Type': 'application/json' },
    });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).host.voice).toBe('alloy');
    expect(await screen.findByText('Global voice defaults saved.')).toBeInTheDocument();
  });

  it('offers the Kiwi class-context route when classless token minting fails', async () => {
    (window as Window & { __KIWI_PODCAST_FORCE_MODE__?: 'live' })
      .__KIWI_PODCAST_FORCE_MODE__ = 'live';
    const user = userEvent.setup();
    render(<AdminApp />);
    sendLiveContext({ includeToken: false });

    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        origin: 'http://localhost:3001',
        data: {
          type: 'kiwi:error',
          message: 'Could not obtain an app token. Open this panel from a class, or sign in as an admin.',
        },
      }));
    });

    expect(await screen.findByText('Authorize through a class')).toBeInTheDocument();
    expect(screen.getByText(/voice settings you save remain global/i)).toBeInTheDocument();
    await user.type(screen.getByLabelText('Authorization class ID'), 'class-1');
    expect(screen.getByRole('link', { name: /Open class-authorized admin/i })).toHaveAttribute(
      'href',
      'http://localhost:3001/admin/app/podcasts/class/class-1',
    );
  });

  it('loads global defaults with a class-scoped system-admin token', async () => {
    (window as Window & { __KIWI_PODCAST_FORCE_MODE__?: 'live' })
      .__KIWI_PODCAST_FORCE_MODE__ = 'live';
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(savedState));
    vi.stubGlobal('fetch', fetchMock);
    render(<AdminApp />);
    sendLiveContext({ classId: 'class-1' });

    expect(await screen.findByText('Saved global settings')).toBeInTheDocument();
    expect(screen.getByText(/Authenticated through class/)).toHaveTextContent('class-1');
    expect(screen.getByText(/saved voice settings remain global/i)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:8010/api/podcast/admin/defaults', {
      headers: { Authorization: 'Bearer admin-token' },
    });
  });

  it('plays a live preview and revokes its Blob URL on unmount', async () => {
    (window as Window & { __KIWI_PODCAST_FORCE_MODE__?: 'live' })
      .__KIWI_PODCAST_FORCE_MODE__ = 'live';
    const previewBlob = new Blob(['wav'], { type: 'audio/wav' });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(savedState))
      .mockResolvedValueOnce({ ok: true, blob: vi.fn().mockResolvedValue(previewBlob) });
    vi.stubGlobal('fetch', fetchMock);
    const createObjectURL = vi.fn(() => 'blob:preview');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
    const user = userEvent.setup();
    const { unmount } = render(<AdminApp />);
    sendLiveContext();

    await screen.findByText('Saved global settings');
    await user.click(screen.getAllByRole('button', { name: 'Preview' })[0]);
    await waitFor(() => expect(createObjectURL).toHaveBeenCalledWith(previewBlob));

    unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:preview');
  });
});

function sendLiveContext({
  classId,
  includeToken = true,
}: { classId?: string; includeToken?: boolean } = {}) {
  act(() => {
    window.dispatchEvent(new MessageEvent('message', {
      origin: 'http://localhost:3001',
      data: {
        type: 'kiwi:context',
        payload: {
          userId: 'admin-1',
          username: 'Admin',
          userRole: 'admin',
          ...(classId ? { classId } : {}),
          appId: 'app-1',
          appSlug: 'podcasts',
          uiSlug: 'global-admin',
          placement: 'admin-panel',
        },
      },
    }));
    if (includeToken) {
      window.dispatchEvent(new MessageEvent('message', {
        origin: 'http://localhost:3001',
        data: {
          type: 'kiwi:appToken',
          payload: { accessToken: 'admin-token', scopes: ['podcast:manage'], appSlug: 'podcasts' },
        },
      }));
    }
  });
}

function jsonResponse(body: unknown) {
  return { ok: true, json: vi.fn().mockResolvedValue(body) };
}

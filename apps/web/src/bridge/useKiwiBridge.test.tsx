import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useKiwiBridge } from './useKiwiBridge';

describe('useKiwiBridge', () => {
  afterEach(() => {
    delete (window as Window & { __KIWI_PODCAST_FORCE_MODE__?: string })
      .__KIWI_PODCAST_FORCE_MODE__;
    window.history.replaceState(null, '', '/');
  });

  it('uses a classless admin context for the standalone admin surface', async () => {
    window.history.replaceState(null, '', '/admin');
    (window as Window & { __KIWI_PODCAST_FORCE_MODE__?: 'simulator' })
      .__KIWI_PODCAST_FORCE_MODE__ = 'simulator';
    const { result } = renderHook(() => useKiwiBridge());

    await waitFor(() => expect(result.current.context?.uiSlug).toBe('global-admin'));
    expect(result.current.context).toMatchObject({
      userRole: 'admin',
      placement: 'admin-panel',
    });
    expect(result.current.context?.classId).toBeUndefined();
  });

  it('uses simulator context and token when not embedded', async () => {
    (window as Window & { __KIWI_PODCAST_FORCE_MODE__?: 'simulator' })
      .__KIWI_PODCAST_FORCE_MODE__ = 'simulator';
    const { result } = renderHook(() => useKiwiBridge());

    await waitFor(() =>
      expect(result.current.context?.classId).toBe('1ef1daa0-6f00-4c52-b13f-fa85b65b3e31'),
    );
    expect(result.current.mode).toBe('simulator');
    expect(result.current.token?.accessToken).toBe('simulated-kiwi-app-token');
  });

  it('posts ready to the parent when embedded', async () => {
    const postMessage = vi.fn();
    (window as Window & { __KIWI_PODCAST_FORCE_MODE__?: 'live' }).__KIWI_PODCAST_FORCE_MODE__ =
      'live';

    const originalWindowParent = Object.getOwnPropertyDescriptor(window, 'parent');
    Object.defineProperty(window, 'parent', {
      configurable: true,
      value: { postMessage },
    });

    try {
      renderHook(() => useKiwiBridge());
      await waitFor(() => expect(postMessage).toHaveBeenCalled());
      expect(postMessage).toHaveBeenCalledWith(
        { type: 'kiwi:ready', payload: { preferredChatMode: 'sidepanel' } },
        '*',
      );
    } finally {
      if (originalWindowParent) {
        Object.defineProperty(window, 'parent', originalWindowParent);
      }
    }
  });
});

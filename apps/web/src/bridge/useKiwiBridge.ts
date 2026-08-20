import { useCallback, useEffect, useMemo, useReducer } from 'react';
import { simulatorContext, simulatorToken } from './simulator';
import { KiwiAppToken, KiwiBridgeAction, KiwiBridgeState, KiwiContext } from './types';

const params = new URLSearchParams(window.location.search);

const isEmbedded = () => window.parent !== window;
const forcedMode = () =>
  (window as Window & { __KIWI_PODCAST_FORCE_MODE__?: 'live' | 'simulator' })
    .__KIWI_PODCAST_FORCE_MODE__;

function initialState(): KiwiBridgeState {
  const mode = forcedMode() || (isEmbedded() ? 'live' : 'simulator');
  return {
    mode,
    connected: false,
    context: null,
    token: null,
    hostOrigin: null,
    error: null,
  };
}

function reducer(state: KiwiBridgeState, action: KiwiBridgeAction): KiwiBridgeState {
  switch (action.type) {
    case 'ready':
      return { ...state, error: null };
    case 'context':
      return {
        ...state,
        connected: true,
        context: action.payload,
        hostOrigin: state.hostOrigin || action.origin,
        error: null,
      };
    case 'token':
      return { ...state, token: action.payload, error: null };
    case 'error':
      return { ...state, error: action.payload };
    default:
      return state;
  }
}

function contextFromQuery(): KiwiContext {
  const isAdminSurface = window.location.pathname.startsWith('/admin')
    || params.get('placement') === 'admin-panel'
    || params.get('uiSlug') === 'global-admin';
  if (isAdminSurface) {
    return {
      userId: params.get('userId') || 'sim-admin-1',
      username: 'Admin Demo',
      userRole: 'admin',
      appId: params.get('appId') || simulatorContext.appId,
      appSlug: 'kiwi-podcast',
      uiSlug: params.get('uiSlug') || 'global-admin',
      placement: 'admin-panel',
      isAdmin: true,
      capabilities: ['mcp'],
    };
  }
  return {
    ...simulatorContext,
    classId: params.get('classId') || simulatorContext.classId,
    appId: params.get('appId') || simulatorContext.appId,
    userId: params.get('userId') || simulatorContext.userId,
    uiSlug: params.get('uiSlug') || simulatorContext.uiSlug,
  };
}

export function useKiwiBridge() {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);

  const post = useCallback(
    (type: string, payload: Record<string, unknown> = {}) => {
      if (state.mode === 'simulator') return;
      const targetOrigin = state.hostOrigin || '*';
      window.parent.postMessage({ type, payload }, targetOrigin);
    },
    [state.hostOrigin, state.mode],
  );

  const sendReady = useCallback(() => {
    dispatch({ type: 'ready' });
    if (state.mode === 'simulator') {
      window.setTimeout(() => {
        dispatch({ type: 'context', payload: contextFromQuery(), origin: '(simulator)' });
        dispatch({ type: 'token', payload: simulatorToken });
      }, 150);
      return;
    }

    window.parent.postMessage(
      { type: 'kiwi:ready', payload: { preferredChatMode: 'sidepanel' } },
      '*',
    );
  }, [state.mode]);

  const requestToken = useCallback((reason?: string) => {
    if (state.mode === 'simulator') {
      dispatch({ type: 'token', payload: simulatorToken });
      return;
    }
    post('kiwi:requestToken', reason ? { reason } : {});
  }, [post, state.mode]);

  const updateContext = useCallback(
    (context: string) => {
      post('kiwi:updateContext', { context });
    },
    [post],
  );

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      const { type, payload } = event.data || {};
      if (!type || !String(type).startsWith('kiwi:')) return;

      if (state.hostOrigin && event.origin !== state.hostOrigin) {
        dispatch({ type: 'error', payload: 'Ignored Kiwi message from unexpected origin.' });
        return;
      }

      if (type === 'kiwi:context') {
        dispatch({ type: 'context', payload: payload as KiwiContext, origin: event.origin });
      }

      if (type === 'kiwi:appToken') {
        dispatch({ type: 'token', payload: payload as KiwiAppToken });
      }

      if (type === 'kiwi:aiError') {
        dispatch({ type: 'error', payload: payload?.error || 'Kiwi AI request failed.' });
      }

      if (type === 'kiwi:error') {
        dispatch({
          type: 'error',
          payload: payload?.error || event.data?.message || 'Kiwi could not initialize the app.',
        });
      }
    }

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [state.hostOrigin]);

  useEffect(() => {
    sendReady();
  }, [sendReady]);

  useEffect(() => {
    if (state.context && !state.token) {
      requestToken();
    }
  }, [requestToken, state.context, state.token]);

  return useMemo(
    () => ({
      ...state,
      sendReady,
      requestToken,
      updateContext,
    }),
    [requestToken, sendReady, state, updateContext],
  );
}

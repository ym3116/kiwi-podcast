import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Headphones,
  KeyRound,
  Loader2,
  Save,
  Settings2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchPodcastGlobalDefaults,
  previewGlobalVoice,
  updatePodcastGlobalDefaults,
} from './api/podcastApi';
import { useKiwiBridge } from './bridge/useKiwiBridge';
import { VoiceEditor } from './components/VoiceEditor';
import {
  PodcastGlobalDefaultsState,
  PodcastVoiceSettings,
  VoiceProfile,
} from './types/podcast';

const simulatorDefaults: PodcastGlobalDefaultsState = {
  defaults: {
    host: {
      mode: 'preset',
      voice: 'nova',
      description: 'A bright female voice, warm, expressive and enthusiastic, American accent.',
      seed: 505,
      referenceText: 'Hi! I am so excited to dive into this with you today.',
    },
    speaker: {
      mode: 'preset',
      voice: 'onyx',
      description: 'A lively male voice, warm, engaged and upbeat, British accent.',
      seed: 404,
      referenceText: 'Absolutely, I have been looking forward to this all week.',
    },
  },
  source: 'environment',
  updatedAt: null,
};

const cloneSettings = (settings: PodcastVoiceSettings): PodcastVoiceSettings => ({
  host: { ...settings.host },
  speaker: { ...settings.speaker },
});

export function AdminApp() {
  const bridge = useKiwiBridge();
  const [state, setState] = useState<PodcastGlobalDefaultsState | null>(null);
  const [draft, setDraft] = useState<PodcastVoiceSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [playingPreview, setPlayingPreview] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState<string | null>(null);
  const [authorizationClassId, setAuthorizationClassId] = useState('');
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const previewRequestRef = useRef(0);

  useEffect(() => {
    if (!bridge.context) return;
    if (bridge.mode === 'live' && !bridge.token?.accessToken) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      setSavedMessage(null);
      try {
        const next = bridge.mode === 'simulator'
          ? simulatorDefaults
          : await fetchPodcastGlobalDefaults(bridge.token!.accessToken);
        if (cancelled) return;
        setState(next);
        setDraft(cloneSettings(next.defaults));
      } catch (caught) {
        if (cancelled) return;
        const message = caught instanceof Error ? caught.message : 'Unable to load global defaults.';
        setError(message);
        if (/401|expired|rejected.*token/i.test(message)) bridge.requestToken('expired');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [bridge.context, bridge.mode, bridge.token?.accessToken, reloadKey]);

  const stopPreview = useCallback(() => {
    previewRequestRef.current += 1;
    const audio = previewAudioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
      previewAudioRef.current = null;
    }
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setPlayingPreview(null);
    setLoadingPreview(null);
  }, []);

  useEffect(() => () => {
    previewRequestRef.current += 1;
    previewAudioRef.current?.pause();
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
  }, []);

  const togglePreview = async (key: string, profile: VoiceProfile) => {
    if (bridge.mode === 'simulator') return;
    if (playingPreview === key) {
      stopPreview();
      return;
    }
    const token = bridge.token?.accessToken;
    if (!token) return;
    stopPreview();
    const requestId = previewRequestRef.current;
    setLoadingPreview(key);
    setError(null);
    setSavedMessage(null);
    try {
      const blob = await previewGlobalVoice(profile, token);
      if (previewRequestRef.current !== requestId) return;
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      previewUrlRef.current = url;
      previewAudioRef.current = audio;
      audio.addEventListener('ended', stopPreview, { once: true });
      audio.addEventListener('error', stopPreview, { once: true });
      setPlayingPreview(key);
      setLoadingPreview(null);
      await audio.play();
    } catch (caught) {
      if (previewRequestRef.current !== requestId) return;
      stopPreview();
      const message = caught instanceof Error ? caught.message : 'Unable to play voice preview.';
      setError(message);
      if (/401|expired|rejected.*token/i.test(message)) bridge.requestToken('expired');
    }
  };

  const save = async () => {
    if (!draft) return;
    stopPreview();
    setSaving(true);
    setError(null);
    setSavedMessage(null);
    try {
      const next = bridge.mode === 'simulator'
        ? { defaults: cloneSettings(draft), source: 'saved' as const, updatedAt: new Date().toISOString() }
        : await updatePodcastGlobalDefaults(bridge.token!.accessToken, draft);
      setState(next);
      setDraft(cloneSettings(next.defaults));
      setSavedMessage(
        bridge.mode === 'simulator'
          ? 'Saved for this Simulator session.'
          : 'Global voice defaults saved.',
      );
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Unable to save global defaults.';
      setError(message);
      if (/401|expired|rejected.*token/i.test(message)) bridge.requestToken('expired');
    } finally {
      setSaving(false);
    }
  };

  const dirty = useMemo(
    () => Boolean(state && draft && JSON.stringify(state.defaults) !== JSON.stringify(draft)),
    [draft, state],
  );
  const forbiddenContext = bridge.mode === 'live'
    && Boolean(bridge.context?.userRole)
    && bridge.context?.userRole !== 'admin';
  const needsClassAuthorization = bridge.mode === 'live'
    && Boolean(bridge.context)
    && !bridge.token?.accessToken
    && Boolean(bridge.error);
  const classAuthorizationUrl = useMemo(() => {
    const classId = authorizationClassId.trim();
    if (!classId || !bridge.hostOrigin) return null;
    const appSlug = bridge.context?.appSlug || 'kiwi-podcast';
    return `${bridge.hostOrigin}/admin/app/${encodeURIComponent(appSlug)}/class/${encodeURIComponent(classId)}`;
  }, [authorizationClassId, bridge.context?.appSlug, bridge.hostOrigin]);

  return (
    <div className="admin-app">
      <aside className="admin-app-sidebar" aria-label="Podcast admin navigation">
        <div className="admin-app-brand"><Headphones size={25} /><span>Podcast Admin</span></div>
        <nav>
          <button className="active" type="button" aria-current="page">
            <Settings2 size={18} /> Global Defaults
          </button>
        </nav>
        <div className="admin-app-runtime" aria-label="Runtime status">
          <span className={bridge.mode === 'simulator' ? 'status-dot sim' : 'status-dot live'} />
          {bridge.mode === 'simulator' ? 'Simulator' : bridge.connected ? 'Connected to Kiwi' : 'Connecting'}
        </div>
      </aside>

      <main className="admin-app-content">
        <header className="admin-app-header">
          <div>
            <div className="eyebrow">System-wide configuration</div>
            <h1>Global voice defaults</h1>
            <p>Classes inherit these voices unless they have saved their own class or episode override.</p>
          </div>
          {state ? (
            <span className="admin-source-badge">
              {state.source === 'saved' ? 'Saved global settings' : 'Environment defaults'}
            </span>
          ) : null}
        </header>

        {forbiddenContext ? (
          <section className="admin-message error" role="alert">
            <AlertCircle size={22} />
            <div><strong>System admin access required</strong><p>This panel cannot be used by an instructor or professor.</p></div>
          </section>
        ) : needsClassAuthorization ? (
          <section className="admin-message admin-auth-recovery" aria-labelledby="class-auth-title">
            <KeyRound size={24} />
            <div>
              <strong id="class-auth-title">Authorize through a class</strong>
              <p>
                Kiwi could not issue a classless admin token. Choose a class where Podcast is enabled;
                Kiwi will use that class only to authenticate you as a system admin. The voice settings
                you save remain global.
              </p>
              <label className="admin-auth-class-field">
                <span>Authorization class ID</span>
                <input
                  type="text"
                  value={authorizationClassId}
                  placeholder="Paste a Kiwi class ID"
                  onChange={(event) => setAuthorizationClassId(event.target.value)}
                />
              </label>
              {classAuthorizationUrl ? (
                <a
                  className="primary-button admin-auth-link"
                  href={classAuthorizationUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open class-authorized admin <ExternalLink size={16} />
                </a>
              ) : (
                <button className="primary-button" type="button" disabled>
                  Open class-authorized admin <ExternalLink size={16} />
                </button>
              )}
              <small>{bridge.error}</small>
            </div>
          </section>
        ) : loading ? (
          <section className="admin-message"><Loader2 className="spin" size={24} /><p>Loading global defaults…</p></section>
        ) : error && !draft ? (
          <section className="admin-message error" role="alert">
            <AlertCircle size={22} />
            <div><strong>Unable to load global defaults</strong><p>{error}</p><button className="secondary-button" type="button" onClick={() => setReloadKey((key) => key + 1)}>Retry</button></div>
          </section>
        ) : draft ? (
          <>
            {bridge.mode === 'simulator' ? (
              <div className="admin-notice">Simulator saves last until this page is refreshed. Voice preview requires an embedded Kiwi admin session and a configured TTS service.</div>
            ) : null}
            {bridge.mode === 'live' && bridge.context?.classId ? (
              <div className="admin-notice">
                Authenticated through class <code>{bridge.context.classId}</code>. This class supplies
                authorization only; saved voice settings remain global for every class without an override.
              </div>
            ) : null}
            <section className="manager-panel admin-defaults-panel">
              <div className="section-header">
                <div><div className="eyebrow">Inherited configuration</div><h2>Podcast speakers</h2></div>
                {state?.updatedAt ? <small>Last saved {new Date(state.updatedAt).toLocaleString()}</small> : null}
              </div>
              <div className="voice-grid">
                <VoiceEditor
                  label="Host"
                  value={draft.host}
                  isPreviewing={playingPreview === 'host'}
                  isPreviewLoading={loadingPreview === 'host'}
                  previewDisabled={bridge.mode === 'simulator'}
                  previewDisabledReason="Voice preview requires live Kiwi admin mode"
                  onChange={(host) => { setDraft((current) => current ? { ...current, host } : current); setSavedMessage(null); }}
                  onPreview={() => void togglePreview('host', draft.host)}
                />
                <VoiceEditor
                  label="Speaker"
                  value={draft.speaker}
                  isPreviewing={playingPreview === 'speaker'}
                  isPreviewLoading={loadingPreview === 'speaker'}
                  previewDisabled={bridge.mode === 'simulator'}
                  previewDisabledReason="Voice preview requires live Kiwi admin mode"
                  onChange={(speaker) => { setDraft((current) => current ? { ...current, speaker } : current); setSavedMessage(null); }}
                  onPreview={() => void togglePreview('speaker', draft.speaker)}
                />
              </div>
              {error ? <p className="generation-error" role="alert"><AlertCircle size={16} />{error}</p> : null}
              {savedMessage ? <p className="admin-saved-message" role="status"><CheckCircle2 size={17} />{savedMessage}</p> : null}
              <div className="admin-save-row">
                <p>Published audio is not changed or regenerated automatically.</p>
                <button className="primary-button" type="button" disabled={saving || !dirty} onClick={() => void save()}>
                  {saving ? <Loader2 className="spin" size={16} /> : <Save size={16} />}
                  {saving ? 'Saving…' : 'Save global defaults'}
                </button>
              </div>
            </section>
          </>
        ) : null}

        {bridge.error && !needsClassAuthorization ? <p className="generation-error" role="alert"><AlertCircle size={16} />{bridge.error}</p> : null}
      </main>
    </div>
  );
}

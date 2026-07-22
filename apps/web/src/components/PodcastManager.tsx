import { AlertCircle, FileText, Loader2, Mic2, Play, Save, Sparkles, Trash2, Upload } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  deleteManagedEpisode,
  fetchManagedPreviewAudio,
  generateManagedDraft,
  previewManagedVoice,
  publishManagedEpisode,
  renderManagedEpisode,
  updateManagedEpisode,
  updatePodcastDefaults,
} from '../api/podcastApi';
import {
  ManagedEpisode,
  PodcastManagementState,
  PodcastVoiceSettings,
  presetVoices,
  VoiceProfile,
} from '../types/podcast';

interface Props {
  data: PodcastManagementState;
  token: string;
  onRefresh: () => Promise<void> | void;
  onPublished: () => void;
}

const cloneProfile = (profile: VoiceProfile): VoiceProfile => ({ ...profile });

function scriptText(episode: ManagedEpisode) {
  return episode.draft.turns
    .map((turn) => `${turn.speaker === 'HOST_A' ? 'host' : 'speaker'}: ${turn.text}`)
    .join('\n');
}

function parseScript(value: string) {
  return value.split(/\r?\n/).flatMap((raw, index) => {
    const line = raw.trim();
    if (!line) return [];
    const match = line.match(/^(host|speaker)\s*[:：]\s*(.+)$/i);
    if (!match) throw new Error(`Line ${index + 1} must start with “host:” or “speaker:”`);
    return [{ speaker: match[1].toLowerCase() === 'host' ? 'HOST_A' as const : 'HOST_B' as const, text: match[2].trim() }];
  });
}

function VoiceEditor({
  label,
  value,
  disabled = false,
  onChange,
  onPreview,
}: {
  label: string;
  value: VoiceProfile;
  disabled?: boolean;
  onChange: (value: VoiceProfile) => void;
  onPreview: () => void;
}) {
  const field = <K extends keyof VoiceProfile>(key: K, next: VoiceProfile[K]) => onChange({ ...value, [key]: next });
  return (
    <fieldset className="voice-editor" disabled={disabled}>
      <legend>{label}</legend>
      <div className="manager-field-row">
        <label>Mode<select value={value.mode} onChange={(event) => field('mode', event.target.value as VoiceProfile['mode'])}><option value="preset">Preset</option><option value="custom">Custom prompt</option></select></label>
        <label>Preset voice<select value={value.voice} onChange={(event) => field('voice', event.target.value as VoiceProfile['voice'])}>{presetVoices.map((voice) => <option key={voice}>{voice}</option>)}</select></label>
        <button className="secondary-button compact-button" type="button" onClick={onPreview}><Play size={15} /> Preview</button>
      </div>
      <label>Voice description<textarea rows={2} value={value.description} onChange={(event) => field('description', event.target.value)} /></label>
      <div className="manager-field-row">
        <label>Custom seed<input type="number" value={value.seed} onChange={(event) => field('seed', Number(event.target.value))} /></label>
        <label className="wide-field">Reference phrase<input value={value.referenceText} onChange={(event) => field('referenceText', event.target.value)} /></label>
      </div>
    </fieldset>
  );
}

export function PodcastManager({ data, token, onRefresh, onPublished }: Props) {
  const [defaults, setDefaults] = useState<PodcastVoiceSettings>(data.defaults);
  const [selectedId, setSelectedId] = useState(data.episodes[0]?.documentId ?? '');
  const selected = useMemo(
    () => data.episodes.find((episode) => episode.documentId === selectedId) ?? data.episodes[0],
    [data.episodes, selectedId],
  );
  const [title, setTitle] = useState(selected?.title ?? '');
  const [summary, setSummary] = useState(selected?.draft.summary ?? '');
  const [duration, setDuration] = useState(selected?.draft.durationTargetMinutes ?? 10);
  const [script, setScript] = useState(selected ? scriptText(selected) : '');
  const [hostOverride, setHostOverride] = useState(Boolean(selected?.voiceOverrides.host));
  const [speakerOverride, setSpeakerOverride] = useState(Boolean(selected?.voiceOverrides.speaker));
  const [host, setHost] = useState<VoiceProfile>(cloneProfile(selected?.effectiveVoices.host ?? data.defaults.host));
  const [speaker, setSpeaker] = useState<VoiceProfile>(cloneProfile(selected?.effectiveVoices.speaker ?? data.defaults.speaker));
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => setDefaults(data.defaults), [data.defaults]);
  useEffect(() => {
    if (!selected) return;
    setSelectedId(selected.documentId);
    setTitle(selected.title);
    setSummary(selected.draft.summary);
    setDuration(selected.draft.durationTargetMinutes);
    setScript(scriptText(selected));
    setHostOverride(Boolean(selected.voiceOverrides.host));
    setSpeakerOverride(Boolean(selected.voiceOverrides.speaker));
    setHost(cloneProfile(selected.voiceOverrides.host ?? selected.effectiveVoices.host));
    setSpeaker(cloneProfile(selected.voiceOverrides.speaker ?? selected.effectiveVoices.speaker));
    setConfirmDelete(false);
  }, [selected?.documentId, selected?.draft.revision, selected?.latestRender?.status, selected?.published?.jobId]);

  useEffect(() => {
    if (!data.episodes.some((episode) => episode.latestRender?.status === 'generating')) return;
    const timer = window.setInterval(() => void onRefresh(), 2000);
    return () => window.clearInterval(timer);
  }, [data.episodes, onRefresh]);

  const act = async (name: string, operation: () => Promise<unknown>, published = false) => {
    setBusy(name);
    setError(null);
    try {
      await operation();
      await onRefresh();
      if (published) onPublished();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Management action failed');
    } finally {
      setBusy(null);
    }
  };

  const saveEpisode = async () => {
    if (!selected) return;
    const turns = parseScript(script);
    await updateManagedEpisode(data.classId, selected.documentId, token, {
      title,
      draft: { summary, durationTargetMinutes: duration, turns },
      voiceOverrides: {
        ...(hostOverride ? { host } : {}),
        ...(speakerOverride ? { speaker } : {}),
      },
    });
  };

  const previewVoice = async (profile: VoiceProfile) => {
    setBusy('voice-preview');
    setError(null);
    try {
      const blob = await previewManagedVoice(data.classId, profile, token);
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.addEventListener('ended', () => URL.revokeObjectURL(url), { once: true });
      await audio.play();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to preview voice');
    } finally {
      setBusy(null);
    }
  };

  if (!selected) return <div className="empty-state"><FileText size={28} /><p>No class-material documents are available.</p></div>;
  const latest = selected.latestRender;
  const canPublish = latest?.status === 'ready' && latest.draftRevision === selected.draft.revision;

  return (
    <main className="manager-page">
      <section className="manager-hero">
        <div><div className="eyebrow">Professor workspace</div><h1>Manage {data.className} podcasts</h1><p>Draft, voice, preview, and publish one episode for each Kiwi class document.</p></div>
        <span className="manager-badge">{data.episodes.length} documents</span>
      </section>

      <section className="manager-panel">
        <div className="section-header"><div><div className="eyebrow">Shared configuration</div><h2>Class voice defaults</h2></div><button className="secondary-button" type="button" disabled={Boolean(busy)} onClick={() => void act('defaults', () => updatePodcastDefaults(data.classId, token, defaults))}><Save size={16} /> Save defaults</button></div>
        <div className="voice-grid">
          <VoiceEditor label="Host" value={defaults.host} onChange={(hostValue) => setDefaults((current) => ({ ...current, host: hostValue }))} onPreview={() => void previewVoice(defaults.host)} />
          <VoiceEditor label="Speaker" value={defaults.speaker} onChange={(speakerValue) => setDefaults((current) => ({ ...current, speaker: speakerValue }))} onPreview={() => void previewVoice(defaults.speaker)} />
        </div>
      </section>

      <div className="manager-workspace">
        <aside className="manager-episode-list" aria-label="Class podcast episodes">
          {data.episodes.map((episode) => (
            <button key={episode.documentId} className={episode.documentId === selected.documentId ? 'active' : ''} type="button" onClick={() => setSelectedId(episode.documentId)}>
              <strong>{episode.title}</strong><span>{episode.documentName}</span><small>{episode.published ? 'Published' : episode.latestRender?.status === 'generating' ? 'Rendering' : 'Unpublished'}</small>
            </button>
          ))}
        </aside>

        <section className="manager-panel episode-editor">
          <div className="section-header"><div><div className="eyebrow">{selected.materialType}</div><h2>{selected.documentName}</h2></div>{selected.published ? <span className="published-chip">Published</span> : <span className="draft-chip">Not published</span>}</div>
          <label>Student-facing title<input value={title} maxLength={160} onChange={(event) => setTitle(event.target.value)} /></label>
          <div className="manager-field-row"><label className="wide-field">Draft summary<input value={summary} onChange={(event) => setSummary(event.target.value)} /></label><label>Target minutes<input type="number" min={1} max={60} value={duration} onChange={(event) => setDuration(Number(event.target.value))} /></label></div>

          <div className="override-heading"><h3>Episode voices</h3><p>Enable an override only when this episode should differ from the class defaults.</p></div>
          <label className="override-toggle"><input type="checkbox" checked={hostOverride} onChange={(event) => { setHostOverride(event.target.checked); if (event.target.checked) setHost(cloneProfile(defaults.host)); }} /> Override host</label>
          <VoiceEditor label="Host override" value={host} disabled={!hostOverride} onChange={setHost} onPreview={() => void previewVoice(host)} />
          <label className="override-toggle"><input type="checkbox" checked={speakerOverride} onChange={(event) => { setSpeakerOverride(event.target.checked); if (event.target.checked) setSpeaker(cloneProfile(defaults.speaker)); }} /> Override speaker</label>
          <VoiceEditor label="Speaker override" value={speaker} disabled={!speakerOverride} onChange={setSpeaker} onPreview={() => void previewVoice(speaker)} />

          <div className="script-editor-heading"><div><h3>Script draft</h3><p>Each non-empty line must start with <code>host:</code> or <code>speaker:</code>.</p></div><button className="secondary-button" type="button" disabled={Boolean(busy)} onClick={() => void act('draft', () => generateManagedDraft(data.classId, selected.documentId, token))}><Sparkles size={16} /> Generate draft</button></div>
          <textarea className="manager-script" rows={16} value={script} onChange={(event) => setScript(event.target.value)} placeholder={'host: Welcome to the episode.\nspeaker: Let’s explore today’s material.'} />

          {latest ? <div className={`render-status ${latest.status}`}><span>{latest.status === 'generating' ? <Loader2 className="spin" size={17} /> : <Mic2 size={17} />}{latest.statusMessage}</span><strong>{latest.progressPercent}%</strong>{latest.errorMessage ? <p>{latest.errorMessage}</p> : null}<div><i style={{ width: `${latest.progressPercent}%` }} /></div></div> : null}
          {error ? <p className="generation-error"><AlertCircle size={16} />{error}</p> : null}

          <div className="manager-actions">
            <button className="secondary-button" type="button" disabled={Boolean(busy)} onClick={() => void act('save', saveEpisode)}><Save size={16} /> Save draft</button>
            <button className="primary-button" type="button" disabled={Boolean(busy) || latest?.status === 'generating'} onClick={() => void act('render', async () => { await saveEpisode(); return renderManagedEpisode(data.classId, selected.documentId, token); })}><Mic2 size={16} /> Render preview</button>
            <button className="secondary-button" type="button" disabled={Boolean(busy) || !latest?.previewAvailable} onClick={() => void act('play-preview', async () => { const blob = await fetchManagedPreviewAudio(data.classId, latest!.jobId, token); const url = URL.createObjectURL(blob); const audio = new Audio(url); audio.addEventListener('ended', () => URL.revokeObjectURL(url), { once: true }); await audio.play(); })}><Play size={16} /> Play preview</button>
            <button className="publish-button" type="button" disabled={Boolean(busy) || !canPublish} onClick={() => void act('publish', () => publishManagedEpisode(data.classId, selected.documentId, latest!.jobId, token), true)}><Upload size={16} /> Publish</button>
            {!confirmDelete ? <button className="danger-button" type="button" disabled={Boolean(busy)} onClick={() => setConfirmDelete(true)}><Trash2 size={16} /> Delete podcast</button> : <span className="delete-confirm-inline">Delete generated audio and history?<button type="button" onClick={() => void act('delete', () => deleteManagedEpisode(data.classId, selected.documentId, token), true)}>Confirm</button><button type="button" onClick={() => setConfirmDelete(false)}>Cancel</button></span>}
          </div>
        </section>
      </div>
    </main>
  );
}

import { Loader2, Pause, Play } from 'lucide-react';
import { presetVoices, VoiceProfile } from '../types/podcast';

export function VoiceEditor({
  label,
  value,
  disabled = false,
  isPreviewing,
  isPreviewLoading,
  previewDisabled = false,
  previewDisabledReason,
  onChange,
  onPreview,
}: {
  label: string;
  value: VoiceProfile;
  disabled?: boolean;
  isPreviewing: boolean;
  isPreviewLoading: boolean;
  previewDisabled?: boolean;
  previewDisabledReason?: string;
  onChange: (value: VoiceProfile) => void;
  onPreview: () => void;
}) {
  const field = <K extends keyof VoiceProfile>(key: K, next: VoiceProfile[K]) =>
    onChange({ ...value, [key]: next });

  return (
    <fieldset className="voice-editor" disabled={disabled}>
      <legend>{label}</legend>
      <div className="manager-field-row">
        <label>
          Mode
          <select
            value={value.mode}
            onChange={(event) => field('mode', event.target.value as VoiceProfile['mode'])}
          >
            <option value="preset">Preset</option>
            <option value="custom">Custom prompt</option>
          </select>
        </label>
        {value.mode === 'preset' ? (
          <label>
            Preset voice
            <select
              value={value.voice}
              onChange={(event) => field('voice', event.target.value as VoiceProfile['voice'])}
            >
              {presetVoices.map((voice) => <option key={voice}>{voice}</option>)}
            </select>
          </label>
        ) : null}
        <button
          className="secondary-button compact-button"
          type="button"
          disabled={isPreviewLoading || previewDisabled}
          title={previewDisabled ? previewDisabledReason : undefined}
          onClick={onPreview}
        >
          {isPreviewLoading ? (
            <Loader2 className="spin" size={15} />
          ) : isPreviewing ? (
            <Pause size={15} />
          ) : (
            <Play size={15} />
          )}
          {isPreviewing ? 'Stop preview' : 'Preview'}
        </button>
      </div>
      {value.mode === 'custom' ? (
        <>
          <label>
            Voice description
            <textarea
              rows={2}
              maxLength={500}
              value={value.description}
              onChange={(event) => field('description', event.target.value)}
            />
          </label>
          <label>
            Custom seed
            <input
              type="number"
              value={value.seed}
              onChange={(event) => field('seed', Number(event.target.value))}
            />
            <small>
              Reproduces a similar custom voice from the same description. Change it to explore
              another variation.
            </small>
          </label>
        </>
      ) : null}
      <label>
        Reference phrase
        <input
          maxLength={300}
          value={value.referenceText}
          onChange={(event) => field('referenceText', event.target.value)}
        />
        <small>This phrase is spoken only while building the voice preview and anchor.</small>
      </label>
    </fieldset>
  );
}

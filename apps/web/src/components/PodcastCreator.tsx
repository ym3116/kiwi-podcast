import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  Clock3,
  FileText,
  Loader2,
  Play,
  RadioTower,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { createMyPodcast, fetchCreatorMaterials, fetchMyPodcast, retryMyPodcast } from '../api/podcastApi';
import { DemoMaterial, PersonalPodcast, PodcastDifficulty } from '../types/podcast';

interface Props {
  classId: string;
  userId: string;
  token: string;
  onCancel: () => void;
  onComplete: () => void;
  onPlayReady: (podcast: PersonalPodcast) => void;
  onContextChange?: (context: string) => void;
}

const examples = [
  'Give me a quick review of the most important concepts.',
  'Explain the selected materials using intuitive examples.',
  'Create an advanced exam review and highlight common mistakes.',
];
const steps = ['Idea', 'Materials', 'Length', 'Difficulty', 'Generate'];

export function PodcastCreator({ classId, userId, token, onCancel, onComplete, onPlayReady, onContextChange }: Props) {
  const [step, setStep] = useState(0);
  const [prompt, setPrompt] = useState('');
  const [materials, setMaterials] = useState<DemoMaterial[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [duration, setDuration] = useState<5 | 10 | 15>(5);
  const [durationTouched, setDurationTouched] = useState(false);
  const [difficulty, setDifficulty] = useState<PodcastDifficulty>('intermediate');
  const [difficultyTouched, setDifficultyTouched] = useState(false);
  const [podcast, setPodcast] = useState<PersonalPodcast | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [displayProgress, setDisplayProgress] = useState(5);

  useEffect(() => {
    fetchCreatorMaterials(classId, token)
      .then(({ materials }) => setMaterials(materials))
      .catch((error) => setError(error instanceof Error ? error.message : 'Unable to load materials'))
      .finally(() => setLoading(false));
  }, [classId, token]);

  const searchable = prompt.toLowerCase().split(/\W+/).filter((word) => word.length > 3);
  const recommendedIds = useMemo(() => {
    const ranked = materials
      .map((material) => ({
        id: material.id,
        score: searchable.filter((word) => `${material.documentName} ${material.preview}`.toLowerCase().includes(word)).length,
      }))
      .sort((a, b) => b.score - a.score);
    const matched = ranked.filter((item) => item.score > 0).slice(0, 3).map((item) => item.id);
    return matched.length ? matched : materials.slice(0, Math.min(2, materials.length)).map((material) => material.id);
  }, [materials, prompt]);

  const recommendedDuration: 5 | 10 | 15 = /deep|detailed|comprehensive/i.test(prompt) || selected.length >= 4
    ? 15
    : selected.length >= 2 && !/quick|summary|recap/i.test(prompt)
      ? 10
      : 5;
  const recommendedDifficulty: PodcastDifficulty = /new to|basics|simple|from scratch/i.test(prompt)
    ? 'beginner'
    : /advanced|technical|proof|deep dive/i.test(prompt)
      ? 'advanced'
      : 'intermediate';

  useEffect(() => {
    if (!durationTouched) setDuration(recommendedDuration);
  }, [durationTouched, recommendedDuration]);
  useEffect(() => {
    if (!difficultyTouched) setDifficulty(recommendedDifficulty);
  }, [difficultyTouched, recommendedDifficulty]);
  useEffect(() => {
    onContextChange?.(`Creating a podcast. Prompt: ${prompt || 'not entered'}. Materials: ${selected.map((id) => materials.find((m) => m.id === id)?.documentName).filter(Boolean).join(', ') || 'none'}. Length: ${duration} minutes. Difficulty: ${difficulty}.`);
  }, [difficulty, duration, materials, onContextChange, prompt, selected]);

  useEffect(() => {
    if (!podcast || podcast.status === 'ready' || podcast.status === 'failed') return;
    const timer = window.setInterval(async () => {
      try {
        setPodcast(await fetchMyPodcast(classId, podcast.id, userId, token));
      } catch (error) {
        setError(error instanceof Error ? error.message : 'Unable to refresh progress');
      }
    }, 2000);
    return () => window.clearInterval(timer);
  }, [classId, podcast, token, userId]);

  useEffect(() => {
    if (!podcast) return;
    setDisplayProgress(podcast.progressPercent);
    if (podcast.status !== 'generating_script' && podcast.status !== 'generating_audio') return;
    const ceiling = podcast.status === 'generating_script' ? 49 : 90;
    const timer = window.setInterval(() => setDisplayProgress((value) => Math.min(ceiling, value + 1)), 1200);
    return () => window.clearInterval(timer);
  }, [podcast?.progressPercent, podcast?.status]);

  const canContinue = step === 0 ? prompt.trim().length >= 10 : step === 1 ? selected.length > 0 : true;
  const generate = async () => {
    setError(null);
    try {
      const created = await createMyPodcast(classId, token, {
        ownerUserId: userId,
        prompt: prompt.trim(),
        materialIds: selected,
        durationMinutes: duration,
        difficulty,
      });
      setPodcast(created);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to start generation');
    }
  };

  if (podcast) {
    return (
      <main className="creator-shell generation-shell">
        <div className="generation-art" aria-hidden="true"><RadioTower size={46} /><span /><span /><span /></div>
        <div className="eyebrow">Personal podcast studio</div>
        <h1>{podcast.status === 'ready' ? 'Your podcast is ready' : podcast.status === 'failed' ? 'Generation stopped' : 'Creating your podcast'}</h1>
        <p className="generation-message">{podcast.statusMessage}</p>
        <div className="generation-progress" role="progressbar" aria-valuenow={displayProgress} aria-valuemin={0} aria-valuemax={100}>
          <span style={{ width: `${displayProgress}%` }} />
        </div>
        <strong className="progress-number">{displayProgress}%</strong>
        <GenerationStages status={podcast.status} />
        {podcast.errorMessage ? <p className="generation-error">{podcast.errorMessage}</p> : null}
        <div className="creator-actions centered">
          {podcast.status === 'failed' ? (
            <button className="secondary-button" type="button" onClick={async () => setPodcast(await retryMyPodcast(classId, podcast.id, userId, token))}>
              <RotateCcw size={17} /> Try again
            </button>
          ) : null}
          {podcast.status === 'ready' ? (
            <>
              <button className="secondary-button" type="button" onClick={() => onPlayReady(podcast)}><Play size={17} fill="currentColor" /> Play podcast</button>
              <button className="primary-button" type="button" onClick={onComplete}>View My Podcasts</button>
            </>
          ) : null}
          {podcast.status !== 'ready' && podcast.status !== 'failed' ? <button className="text-button" type="button" onClick={onComplete}>Continue browsing</button> : null}
        </div>
      </main>
    );
  }

  return (
    <main className="creator-shell">
      <button className="back-button" type="button" onClick={onCancel}><ArrowLeft size={18} /> Podcast home</button>
      <div className="creator-progress" aria-label="Creation progress">
        {steps.map((label, index) => <div className={index === step ? 'active' : index < step ? 'done' : ''} key={label}><span>{index < step ? <Check size={14} /> : index + 1}</span>{label}</div>)}
      </div>
      <div className="creator-layout">
        <section className="question-card">
          {loading ? <Loader2 className="spin" /> : null}
          {step === 0 ? <IdeaStep prompt={prompt} setPrompt={setPrompt} /> : null}
          {step === 1 ? <MaterialsStep materials={materials} selected={selected} setSelected={setSelected} recommended={recommendedIds} /> : null}
          {step === 2 ? <ChoiceStep title="How long should it be?" subtitle="Choose the depth that fits your available time." options={[['5', 'Quick recap', 'Fast essentials'], ['10', 'Focused review', 'Balanced coverage'], ['15', 'Deep dive', 'Detailed connections']]} value={String(duration)} recommended={String(recommendedDuration)} onChange={(value) => { setDuration(Number(value) as 5 | 10 | 15); setDurationTouched(true); }} icon="clock" /> : null}
          {step === 3 ? <ChoiceStep title="Choose the difficulty" subtitle="We’ll adjust vocabulary, examples, and depth." options={[['beginner', 'Beginner', 'Fundamentals and intuition'], ['intermediate', 'Intermediate', 'Connections and application'], ['advanced', 'Advanced', 'Technical depth and edge cases']]} value={difficulty} recommended={recommendedDifficulty} onChange={(value) => { setDifficulty(value as PodcastDifficulty); setDifficultyTouched(true); }} icon="book" /> : null}
          {step === 4 ? <Review prompt={prompt} materials={materials.filter((m) => selected.includes(m.id))} duration={duration} difficulty={difficulty} /> : null}
          {error ? <p className="generation-error">{error}</p> : null}
          <div className="creator-actions">
            <button className="secondary-button" type="button" disabled={step === 0} onClick={() => setStep((value) => value - 1)}><ArrowLeft size={17} /> Back</button>
            {step < 4 ? <button className="primary-button" type="button" disabled={!canContinue} onClick={() => setStep((value) => value + 1)}>Continue <ArrowRight size={17} /></button> : <button className="primary-button generate-button" type="button" onClick={generate}><Sparkles size={17} /> Generate podcast</button>}
          </div>
        </section>
        <aside className="creator-summary"><div className="eyebrow">Your podcast</div><h2>{prompt || 'Start with an idea'}</h2><dl><dt>Materials</dt><dd>{selected.length || 'Not selected'}</dd><dt>Length</dt><dd>{duration} minutes</dd><dt>Difficulty</dt><dd>{difficulty}</dd></dl></aside>
      </div>
    </main>
  );
}

function IdeaStep({ prompt, setPrompt }: { prompt: string; setPrompt: (value: string) => void }) {
  return <><div className="question-icon"><Sparkles /></div><div className="eyebrow">Step 1 · Idea</div><h1>What would you like to learn?</h1><p>Describe the focus, goal, or style you want for your podcast.</p><textarea className="prompt-input" value={prompt} maxLength={1000} onChange={(event) => setPrompt(event.target.value)} placeholder="For example: Help me understand regularization before the exam…" /><div className="prompt-meta"><span>{prompt.length}/1000</span><span>{prompt.length > 0 && prompt.trim().length < 10 ? 'Add a little more detail' : ''}</span></div><div className="suggestion-chips">{examples.map((example) => <button type="button" key={example} onClick={() => setPrompt(example)}>{example}</button>)}</div></>;
}

function MaterialsStep({ materials, selected, setSelected, recommended }: { materials: DemoMaterial[]; selected: string[]; setSelected: (ids: string[]) => void; recommended: string[] }) {
  const toggle = (id: string) => setSelected(selected.includes(id) ? selected.filter((item) => item !== id) : selected.length < 5 ? [...selected, id] : selected);
  return <><div className="question-icon"><FileText /></div><div className="eyebrow">Step 2 · Materials</div><h1>Choose your source materials</h1><p>Select up to five exported Kiwi documents. The podcast will be grounded in their local text chunks.</p><div className="material-tools"><button type="button" onClick={() => setSelected(recommended)}>Select recommended</button><button type="button" onClick={() => setSelected(materials.slice(0, 5).map((m) => m.id))}>Select all</button><button type="button" onClick={() => setSelected([])}>Clear</button></div><div className="material-grid">{materials.map((material) => <button type="button" className={selected.includes(material.id) ? 'material-card selected' : 'material-card'} key={material.id} onClick={() => toggle(material.id)}><span className="material-check">{selected.includes(material.id) ? <Check size={15} /> : null}</span>{recommended.includes(material.id) ? <span className="recommendation-pill">Recommended</span> : null}<FileText size={22} /><strong>{material.documentName}</strong><small>{material.pageCount ? `${material.pageCount} pages · ` : ''}{material.chunkCount} chunks</small><p>{material.preview || material.materialType}</p></button>)}</div>{materials.length === 0 ? <div className="empty-state"><FileText /><p>No JSON materials were found in the demo-chunks directory.</p></div> : null}</>;
}

function ChoiceStep({ title, subtitle, options, value, recommended, onChange, icon }: { title: string; subtitle: string; options: string[][]; value: string; recommended: string; onChange: (value: string) => void; icon: 'clock' | 'book' }) {
  return <><div className="question-icon">{icon === 'clock' ? <Clock3 /> : <BookOpen />}</div><div className="eyebrow">Choose one</div><h1>{title}</h1><p>{subtitle}</p><div className="choice-grid">{options.map(([id, label, description]) => <button className={value === id ? 'choice-card selected' : 'choice-card'} type="button" key={id} onClick={() => onChange(id)}>{recommended === id ? <span className="recommendation-pill">Recommended</span> : null}<strong>{label}{icon === 'clock' ? ` · ${id} min` : ''}</strong><span>{description}</span>{value === id ? <Check className="choice-check" size={18} /> : null}</button>)}</div></>;
}

function Review({ prompt, materials, duration, difficulty }: { prompt: string; materials: DemoMaterial[]; duration: number; difficulty: string }) {
  return <><div className="question-icon"><Sparkles /></div><div className="eyebrow">Ready to create</div><h1>Everything looks good</h1><p>Generation will begin immediately and may take a few minutes.</p><div className="review-card"><h3>{prompt}</h3><div><Clock3 size={16} /> {duration} minutes</div><div><BookOpen size={16} /> {difficulty}</div><div><FileText size={16} /> {materials.map((m) => m.documentName).join(', ')}</div></div></>;
}

function GenerationStages({ status }: { status: PersonalPodcast['status'] }) {
  const stages = [['preparing_materials', 'Preparing materials'], ['generating_script', 'Writing the podcast'], ['validating_script', 'Reviewing the script'], ['generating_audio', 'Generating host voices'], ['saving', 'Saving your episode']];
  const current = stages.findIndex(([id]) => id === status);
  const allDone = status === 'ready';
  return <ol className="generation-stages">{stages.map(([id, label], index) => <li className={allDone || index < current ? 'done' : index === current ? 'active' : ''} key={id}><span>{allDone || index < current ? <Check size={14} /> : index === current ? <Loader2 className="spin" size={14} /> : null}</span>{label}</li>)}</ol>;
}

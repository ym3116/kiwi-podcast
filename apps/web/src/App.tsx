import { AlertCircle, Headphones, Loader2, Radio } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  deleteMyPodcast,
  fetchClassPodcast,
  fetchMyPodcasts,
  fetchPodcastAudio,
  fetchPodcastManagement,
  retryMyPodcast,
} from './api/podcastApi';
import { simulatorPodcast } from './bridge/simulator';
import { useKiwiBridge } from './bridge/useKiwiBridge';
import { MyPodcasts } from './components/MyPodcasts';
import { PlayerBar } from './components/PlayerBar';
import { PodcastCreator } from './components/PodcastCreator';
import { PodcastDetail } from './components/PodcastDetail';
import { PodcastOverview } from './components/PodcastOverview';
import { PodcastManager } from './components/PodcastManager';
import { PersonalPodcast, PodcastEpisode, PodcastManagementState, PodcastResponse } from './types/podcast';
import { classEpisodeView, personalPodcastView, PodcastSource, PodcastViewItem, podcastViewKey } from './types/podcastView';
import { durationLabelToSeconds, formatDuration } from './utils/audioTime';

type LoadState = 'idle' | 'loading' | 'ready' | 'error';
type MainView = 'home' | 'creator';
type PodcastTab = 'class' | 'mine' | 'manage';
type DetailTarget = { source: PodcastSource; id: string };
const playbackRates = [1, 1.25, 1.5, 2];

function withContextClassName(data: PodcastResponse, className?: string): PodcastResponse {
  const cleanClassName = className?.trim();
  if (!cleanClassName || data.podcast.title !== 'Class - Podcast') return data;
  return { ...data, podcast: { ...data.podcast, title: `${cleanClassName} - Podcast` } };
}

export function App() {
  const bridge = useKiwiBridge();
  const [podcastData, setPodcastData] = useState<PodcastResponse | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('idle');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<DetailTarget | null>(null);
  const [currentTrack, setCurrentTrack] = useState<PodcastViewItem | null>(null);
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
  const [audioLoadingKey, setAudioLoadingKey] = useState<string | null>(null);
  const [playingKey, setPlayingKey] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState<number | null>(null);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [mainView, setMainView] = useState<MainView>('home');
  const [podcastTab, setPodcastTab] = useState<PodcastTab>('class');
  const [myPodcasts, setMyPodcasts] = useState<PersonalPodcast[]>([]);
  const [myPodcastsLoading, setMyPodcastsLoading] = useState(false);
  const [managementData, setManagementData] = useState<PodcastManagementState | null>(null);
  const [previewStopSignal, setPreviewStopSignal] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playbackObjectUrlRef = useRef<string | null>(null);
  const audioLoadRequestRef = useRef(0);
  const currentTimeRef = useRef(0);
  const pendingSeekRef = useRef<number | null>(null);

  useEffect(() => {
    async function loadPodcast() {
      if (!bridge.context) return;
      if (bridge.mode === 'simulator') {
        setPodcastData(simulatorPodcast);
        setLoadState('ready');
        return;
      }
      if (!bridge.token?.accessToken) {
        setLoadState('loading');
        return;
      }
      setLoadState('loading');
      setLoadError(null);
      try {
        const data = await fetchClassPodcast(bridge.context.classId, bridge.token.accessToken);
        setPodcastData(withContextClassName(data, bridge.context.className));
        setLoadState('ready');
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : 'Unable to load podcast.');
        setLoadState('error');
      }
    }
    void loadPodcast();
  }, [bridge.context, bridge.mode, bridge.token, refreshKey]);

  const refreshManagement = useCallback(async () => {
    if (bridge.mode !== 'live' || !bridge.context?.classId || !bridge.token?.accessToken) {
      setManagementData(null);
      return;
    }
    try {
      setManagementData(await fetchPodcastManagement(bridge.context.classId, bridge.token.accessToken));
    } catch (error) {
      setManagementData(null);
      setGenerationError(error instanceof Error ? error.message : 'Unable to load podcast management.');
    }
  }, [bridge.context?.classId, bridge.mode, bridge.token?.accessToken]);

  useEffect(() => { void refreshManagement(); }, [refreshManagement]);
  useEffect(() => {
    if (!managementData && podcastTab === 'manage') setPodcastTab('class');
  }, [managementData, podcastTab]);

  const refreshMyPodcasts = async () => {
    if (!bridge.context?.userId || !bridge.token?.accessToken) return;
    setMyPodcastsLoading(true);
    try {
      const result = await fetchMyPodcasts(
        bridge.context.classId,
        bridge.token.accessToken,
      );
      setMyPodcasts(result.podcasts);
    } catch (error) {
      setGenerationError(error instanceof Error ? error.message : 'Unable to load personal podcasts.');
    } finally {
      setMyPodcastsLoading(false);
    }
  };

  useEffect(() => {
    if (podcastTab === 'mine' && mainView === 'home') void refreshMyPodcasts();
  }, [podcastTab, mainView, bridge.context?.classId, bridge.context?.userId, bridge.token?.accessToken]);

  useEffect(() => {
    if (!myPodcasts.some((podcast) => !['ready', 'failed'].includes(podcast.status))) return;
    const timer = window.setInterval(() => void refreshMyPodcasts(), 2500);
    return () => window.clearInterval(timer);
  }, [myPodcasts]);

  useEffect(() => {
    if (!podcastData || !bridge.updateContext) return;
    const episodeText = podcastData.episodes.slice(0, 5).map((episode) => episode.title).join('; ');
    bridge.updateContext(`Kiwi Podcast loaded ${podcastData.podcast.title}. Episodes: ${episodeText}`);
  }, [bridge.updateContext, podcastData]);

  const selectedItem = useMemo(() => {
    if (!selectedDetail) return null;
    if (selectedDetail.source === 'class') {
      const episode = podcastData?.episodes.find((item) => item.id === selectedDetail.id);
      return episode && podcastData ? classEpisodeView(podcastData.podcast, episode) : null;
    }
    const podcast = myPodcasts.find((item) => item.id === selectedDetail.id);
    return podcast ? personalPodcastView(podcast) : null;
  }, [myPodcasts, podcastData, selectedDetail]);

  useEffect(() => {
    setCurrentTrack((current) => {
      if (!current) return null;
      if (current.source === 'class') {
        const episode = podcastData?.episodes.find((item) => item.id === current.id);
        return episode && podcastData ? classEpisodeView(podcastData.podcast, episode) : current;
      }
      const podcast = myPodcasts.find((item) => item.id === current.id);
      return podcast ? personalPodcastView(podcast) : current;
    });
  }, [myPodcasts, podcastData]);

  const currentKey = currentTrack ? podcastViewKey(currentTrack) : null;
  const fallbackDurationSeconds = useMemo(() => durationLabelToSeconds(currentTrack?.durationLabel), [currentTrack?.durationLabel]);
  const durationSeconds = playbackUrl && audioDuration !== null ? audioDuration : fallbackDurationSeconds;
  const detailItem = useMemo(() => {
    if (!selectedItem || selectedItem.id !== currentTrack?.id || selectedItem.source !== currentTrack.source || audioDuration === null) return selectedItem;
    return { ...selectedItem, durationLabel: formatDuration(audioDuration) };
  }, [audioDuration, currentTrack, selectedItem]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !playbackUrl || !currentKey) return;
    audio.pause();
    audio.src = playbackUrl;
    audio.currentTime = 0;
    audio.playbackRate = playbackRate;
    currentTimeRef.current = 0;
    pendingSeekRef.current = null;
    setCurrentTime(0);
    setAudioDuration(null);
  }, [currentKey, playbackUrl]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !playbackUrl || !currentKey) return;
    audio.playbackRate = playbackRate;
    if (playingKey === currentKey) {
      void audio.play().catch((error) => {
        setGenerationError(error instanceof Error ? error.message : 'Unable to play podcast audio.');
        setPlayingKey(null);
      });
    } else {
      audio.pause();
    }
  }, [currentKey, playbackRate, playbackUrl, playingKey]);

  useEffect(() => () => {
    audioLoadRequestRef.current += 1;
    if (playbackObjectUrlRef.current) {
      URL.revokeObjectURL(playbackObjectUrlRef.current);
      playbackObjectUrlRef.current = null;
    }
  }, []);

  const replacePlaybackUrl = (nextUrl: string | null, objectUrl = false) => {
    if (playbackObjectUrlRef.current) {
      URL.revokeObjectURL(playbackObjectUrlRef.current);
    }
    playbackObjectUrlRef.current = objectUrl ? nextUrl : null;
    setPlaybackUrl(nextUrl);
  };

  const openDetail = (target: DetailTarget) => {
    setMainView('home');
    setPodcastTab(target.source === 'class' ? 'class' : 'mine');
    setSelectedDetail(target);
    setGenerationError(null);
    window.history.replaceState(null, '', `#${target.source}-${target.id}`);
  };

  const closeDetail = () => {
    setSelectedDetail(null);
    setGenerationError(null);
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
  };

  const loadAndPlay = async (item: PodcastViewItem) => {
    if (!item.audioUrl) return;
    const key = podcastViewKey(item);
    if (audioLoadingKey === key) return;
    if (currentKey === key && playbackUrl) {
      setPlayingKey((current) => current === key ? null : key);
      return;
    }

    const requestId = ++audioLoadRequestRef.current;
    setCurrentTrack(item);
    setPlayingKey(null);
    setAudioLoadingKey(key);
    setGenerationError(null);
    replacePlaybackUrl(null);

    try {
      const protectedPodcastAudio = new URL(item.audioUrl, window.location.origin)
        .pathname.startsWith('/api/podcast/');
      if (bridge.mode === 'simulator' && !protectedPodcastAudio) {
        if (requestId !== audioLoadRequestRef.current) return;
        replacePlaybackUrl(item.audioUrl);
      } else {
        const token = bridge.token?.accessToken;
        if (!token) throw new Error('Kiwi app token is not available');
        const blob = await fetchPodcastAudio(item.audioUrl, token);
        const objectUrl = URL.createObjectURL(blob);
        if (requestId !== audioLoadRequestRef.current) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        replacePlaybackUrl(objectUrl, true);
      }
      setPlayingKey(key);
    } catch (error) {
      if (requestId !== audioLoadRequestRef.current) return;
      const message = error instanceof Error ? error.message : 'Unable to load podcast audio.';
      setGenerationError(message);
      setCurrentTrack(null);
      if (/401|expired|rejected.*token/i.test(message)) bridge.requestToken();
    } finally {
      if (requestId === audioLoadRequestRef.current) setAudioLoadingKey(null);
    }
  };

  const playClassEpisode = async (episode: PodcastEpisode) => {
    setPreviewStopSignal((signal) => signal + 1);
    if (!podcastData) return;
    if (episode.status !== 'ready' || !episode.audioUrl) {
      setGenerationError('This class podcast has not been published yet.');
      return;
    }
    await loadAndPlay(classEpisodeView(podcastData.podcast, episode));
  };

  const playPersonalPodcast = async (podcast: PersonalPodcast) => {
    setPreviewStopSignal((signal) => signal + 1);
    if (podcast.status !== 'ready' || !podcast.audioUrl) return;
    await loadAndPlay(personalPodcastView(podcast));
  };

  const toggleCurrentTrack = () => {
    if (!currentKey || !playbackUrl || audioLoadingKey) return;
    setPreviewStopSignal((signal) => signal + 1);
    setPlayingKey((current) => current === currentKey ? null : currentKey);
  };

  const seek = (time: number) => {
    const audio = audioRef.current;
    const hasAudioDuration = Boolean(audio && Number.isFinite(audio.duration) && audio.duration > 0);
    const seekDuration = hasAudioDuration ? audio!.duration : durationSeconds;
    const nextTime = Math.max(0, Math.min(time, seekDuration));
    currentTimeRef.current = nextTime;
    setCurrentTime(nextTime);
    if (!audio || !playbackUrl) return;
    if (!hasAudioDuration) {
      pendingSeekRef.current = nextTime;
      return;
    }
    pendingSeekRef.current = null;
    const seekableAudio = audio as HTMLAudioElement & { fastSeek?: (time: number) => void };
    if (seekableAudio.fastSeek) seekableAudio.fastSeek(nextTime);
    else audio.currentTime = nextTime;
  };

  const skip = (delta: number) => {
    seek((pendingSeekRef.current ?? currentTimeRef.current) + delta);
  };

  const handleAudioMetadata = (audio: HTMLAudioElement) => {
    const duration = audio.duration;
    setAudioDuration(Number.isFinite(duration) && duration > 0 ? duration : null);
    if (pendingSeekRef.current === null || !Number.isFinite(duration) || duration <= 0) return;
    const nextTime = Math.max(0, Math.min(pendingSeekRef.current, duration));
    pendingSeekRef.current = null;
    currentTimeRef.current = nextTime;
    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
  };

  const cycleSpeed = () => setPlaybackRate((rate) => playbackRates[(playbackRates.indexOf(rate) + 1) % playbackRates.length]);

  const switchTab = (tab: PodcastTab) => {
    setPodcastTab(tab);
    setSelectedDetail(null);
    setGenerationError(null);
  };

  const retryPersonal = async (podcast: PersonalPodcast) => {
    if (!bridge.context?.userId || !bridge.token?.accessToken) return;
    await retryMyPodcast(bridge.context.classId, podcast.id, bridge.token.accessToken);
    await refreshMyPodcasts();
  };

  const deletePersonal = async (podcast: PersonalPodcast) => {
    if (!bridge.context?.userId || !bridge.token?.accessToken) return;
    await deleteMyPodcast(bridge.context.classId, podcast.id, bridge.token.accessToken);
    const deletedKey = podcastViewKey(personalPodcastView(podcast));
    if (currentKey === deletedKey) {
      audioRef.current?.pause();
      setCurrentTrack(null);
      setPlayingKey(null);
      audioLoadRequestRef.current += 1;
      replacePlaybackUrl(null);
      setCurrentTime(0);
      setAudioDuration(null);
    }
    if (selectedDetail?.source === 'personal' && selectedDetail.id === podcast.id) setSelectedDetail(null);
    setMyPodcasts((current) => current.filter((item) => item.id !== podcast.id));
  };

  return (
    <div className={currentTrack ? 'app has-player' : 'app'}>
      <header className="topbar">
        <div className="brand"><Headphones size={26} /><span>Kiwi Podcast</span></div>
        <div className="runtime-status" aria-label="Runtime status">
          <span className={bridge.mode === 'simulator' ? 'status-dot sim' : 'status-dot live'} />
          {bridge.mode === 'simulator' ? 'Simulator' : bridge.connected ? 'Live' : 'Connecting'}
        </div>
      </header>

      {currentTrack ? (
        <PlayerBar
          item={currentTrack}
          currentTime={currentTime}
          duration={durationSeconds}
          isPlaying={playingKey === currentKey}
          onOpen={() => openDetail({ source: currentTrack.source, id: currentTrack.id })}
          onCycleSpeed={cycleSpeed}
          onSeek={seek}
          onSkip={skip}
          onTogglePlay={toggleCurrentTrack}
          playbackRate={playbackRate}
        />
      ) : null}

      <audio
        ref={audioRef}
        onEnded={() => setPlayingKey(null)}
        onLoadedMetadata={(event) => handleAudioMetadata(event.currentTarget)}
        onDurationChange={(event) => handleAudioMetadata(event.currentTarget)}
        onTimeUpdate={(event) => {
          currentTimeRef.current = event.currentTarget.currentTime;
          setCurrentTime(event.currentTarget.currentTime);
        }}
        onCanPlay={(event) => handleAudioMetadata(event.currentTarget)}
      />

      {mainView === 'creator' && bridge.context?.userId && bridge.token?.accessToken ? (
        <PodcastCreator
          classId={bridge.context.classId}
          token={bridge.token.accessToken}
          onCancel={() => setMainView('home')}
          onComplete={() => {
            setMainView('home');
            setPodcastTab('mine');
            void refreshMyPodcasts();
          }}
          onPlayReady={playPersonalPodcast}
          onContextChange={bridge.updateContext}
        />
      ) : null}

      {mainView === 'home' && (loadState === 'loading' || loadState === 'idle') ? (
        <div className="center-state"><Loader2 className="spin" size={30} /><p>Loading podcast episodes</p></div>
      ) : null}

      {mainView === 'home' && loadState === 'error' ? (
        <div className="center-state error"><AlertCircle size={32} /><p>{loadError}</p><button className="primary-button" type="button" onClick={() => setRefreshKey((key) => key + 1)}>Retry</button></div>
      ) : null}

      {mainView === 'home' && podcastData && loadState === 'ready' && !selectedDetail ? (
        <main className="page-shell">
          <div className="podcast-tabs" role="tablist" aria-label="Podcast library">
            <button role="tab" aria-selected={podcastTab === 'class'} className={podcastTab === 'class' ? 'active' : ''} type="button" onClick={() => switchTab('class')}>Class Podcast</button>
            <button role="tab" aria-selected={podcastTab === 'mine'} className={podcastTab === 'mine' ? 'active' : ''} type="button" onClick={() => switchTab('mine')}>My Podcasts</button>
            {managementData ? <button role="tab" aria-selected={podcastTab === 'manage'} className={podcastTab === 'manage' ? 'active' : ''} type="button" onClick={() => switchTab('manage')}>Manage</button> : null}
          </div>
          {podcastTab === 'class' ? (
            <PodcastOverview
              data={podcastData}
              playingKey={playingKey}
              onSelectEpisode={(episode) => openDetail({ source: 'class', id: episode.id })}
              onPlayAll={() => { const first = podcastData.episodes.find((episode) => episode.status === 'ready' && episode.audioUrl); if (first) void playClassEpisode(first); }}
              onPlayEpisode={playClassEpisode}
              onRefresh={() => setRefreshKey((key) => key + 1)}
              onCreate={() => setMainView('creator')}
            />
          ) : podcastTab === 'mine' ? (
            <MyPodcasts
              podcasts={myPodcasts}
              loading={myPodcastsLoading}
              playingKey={playingKey}
              onCreate={() => setMainView('creator')}
              onOpen={(podcast) => openDetail({ source: 'personal', id: podcast.id })}
              onPlay={playPersonalPodcast}
              onRetry={retryPersonal}
              onDelete={deletePersonal}
            />
          ) : managementData && bridge.token?.accessToken ? (
            <PodcastManager
              data={managementData}
              token={bridge.token.accessToken}
              onRefresh={refreshManagement}
              onPublished={() => setRefreshKey((key) => key + 1)}
              onPreviewStart={() => setPlayingKey(null)}
              previewStopSignal={previewStopSignal}
            />
          ) : null}
        </main>
      ) : null}

      {mainView === 'home' && detailItem ? (
        <PodcastDetail
          item={detailItem}
          isPlaying={playingKey === podcastViewKey(detailItem)}
          isBusy={audioLoadingKey === podcastViewKey(detailItem)}
          error={generationError}
          onBack={closeDetail}
          onTogglePlay={() => {
            if (detailItem.source === 'class') {
              const episode = podcastData?.episodes.find((item) => item.id === detailItem.id);
              if (episode) return playClassEpisode(episode);
            } else {
              const podcast = myPodcasts.find((item) => item.id === detailItem.id);
              if (podcast) void playPersonalPodcast(podcast);
            }
          }}
          onRetry={detailItem.source === 'personal' ? async () => {
            const podcast = myPodcasts.find((item) => item.id === detailItem.id);
            if (podcast) await retryPersonal(podcast);
          } : undefined}
        />
      ) : null}

      {bridge.error ? <div className="bridge-warning"><Radio size={16} />{bridge.error}</div> : null}
    </div>
  );
}

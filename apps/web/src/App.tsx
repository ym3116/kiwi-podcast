import { AlertCircle, Headphones, Loader2, Radio } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchClassPodcast, generatePodcastEpisode } from './api/podcastApi';
import { simulatorPodcast } from './bridge/simulator';
import { useKiwiBridge } from './bridge/useKiwiBridge';
import { EpisodeDetail } from './components/EpisodeDetail';
import { PlayerBar } from './components/PlayerBar';
import { PodcastOverview } from './components/PodcastOverview';
import { PodcastEpisode, PodcastResponse } from './types/podcast';

type LoadState = 'idle' | 'loading' | 'ready' | 'error';
const playbackRates = [1, 1.25, 1.5, 2];

function durationToSeconds(durationLabel: string | undefined): number {
  const minutes = Number(durationLabel?.match(/(\d+)/)?.[1] ?? 10);
  return minutes * 60;
}

function withContextClassName(data: PodcastResponse, className?: string): PodcastResponse {
  const cleanClassName = className?.trim();
  if (!cleanClassName || data.podcast.title !== 'Class - Podcast') return data;

  return {
    ...data,
    podcast: {
      ...data.podcast,
      title: `${cleanClassName} - Podcast`,
    },
  };
}

export function App() {
  const bridge = useKiwiBridge();
  const [podcastData, setPodcastData] = useState<PodcastResponse | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('idle');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<string | null>(null);
  const [currentEpisodeId, setCurrentEpisodeId] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState<number | null>(null);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const previousEpisodeId = useRef<string | null>(null);

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

  useEffect(() => {
    if (!podcastData || !bridge.updateContext) return;
    const episodeText = podcastData.episodes
      .slice(0, 5)
      .map((episode) => episode.title)
      .join('; ');
    bridge.updateContext(`Kiwi Podcast loaded ${podcastData.podcast.title}. Episodes: ${episodeText}`);
  }, [bridge.updateContext, podcastData]);

  const selectedEpisode = useMemo(() => {
    if (!podcastData || !selectedEpisodeId) return null;
    return podcastData.episodes.find((episode) => episode.id === selectedEpisodeId) ?? null;
  }, [podcastData, selectedEpisodeId]);

  const currentEpisode = useMemo(() => {
    if (!podcastData || !currentEpisodeId) return null;
    return podcastData.episodes.find((episode) => episode.id === currentEpisodeId) ?? null;
  }, [currentEpisodeId, podcastData]);

  const fallbackDurationSeconds = useMemo(
    () => durationToSeconds(currentEpisode?.durationLabel),
    [currentEpisode],
  );
  const durationSeconds = currentEpisode?.audioUrl && audioDuration ? audioDuration : fallbackDurationSeconds;

  useEffect(() => {
    if (previousEpisodeId.current !== currentEpisodeId) {
      previousEpisodeId.current = currentEpisodeId;
      setCurrentTime(0);
      setAudioDuration(null);
    }
  }, [currentEpisodeId]);

  useEffect(() => {
    if (!playingId || !currentEpisode || currentEpisode.audioUrl) return;

    const timer = window.setInterval(() => {
      setCurrentTime((time) => {
        const nextTime = time + playbackRate;
        if (nextTime >= durationSeconds) {
          window.clearInterval(timer);
          setPlayingId(null);
          return durationSeconds;
        }
        return nextTime;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [currentEpisode, durationSeconds, playbackRate, playingId]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentEpisode?.audioUrl) return;

    audio.pause();
    audio.src = currentEpisode.audioUrl;
    audio.currentTime = 0;
    audio.playbackRate = playbackRate;
    setCurrentTime(0);
    setAudioDuration(Number.isFinite(audio.duration) ? audio.duration : null);

    if (playingId === currentEpisode.id) {
      void audio.play().catch((error) => {
        setGenerationError(error instanceof Error ? error.message : 'Unable to play generated audio.');
        setPlayingId(null);
      });
    }
  }, [currentEpisode?.audioUrl, currentEpisode?.id]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentEpisode?.audioUrl) return;
    audio.playbackRate = playbackRate;
  }, [currentEpisode?.audioUrl, playbackRate]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentEpisode?.audioUrl) return;

    if (playingId === currentEpisode.id) {
      void audio.play().catch((error) => {
        setGenerationError(error instanceof Error ? error.message : 'Unable to play generated audio.');
        setPlayingId(null);
      });
    } else {
      audio.pause();
    }
  }, [currentEpisode, playingId]);

  const updateEpisode = (episode: PodcastEpisode) => {
    setPodcastData((current) => {
      if (!current) return current;
      return {
        ...current,
        episodes: current.episodes.map((item) =>
          item.id === episode.id
            ? {
                ...item,
                ...episode,
              }
            : item,
        ),
      };
    });
  };

  const ensureGeneratedEpisode = async (episode: PodcastEpisode): Promise<PodcastEpisode> => {
    if (episode.status === 'ready' && episode.audioUrl) return episode;
    if (!bridge.context || !bridge.token?.accessToken) {
      throw new Error('Podcast generation needs Kiwi context and an app token.');
    }

    setGeneratingId(episode.id);
    setGenerationError(null);
    try {
      const result = await generatePodcastEpisode(
        bridge.context.classId,
        episode.documentId,
        bridge.token.accessToken,
      );
      const nextEpisode =
        result.episode ??
        ({
          ...episode,
          status: result.job.status,
          audioUrl: result.job.audioUrl,
          generatedAt: result.job.generatedAt,
          errorMessage: result.job.errorMessage,
        } satisfies PodcastEpisode);
      updateEpisode(nextEpisode);
      if (nextEpisode.status !== 'ready' || !nextEpisode.audioUrl) {
        throw new Error(nextEpisode.errorMessage || 'Podcast generation did not produce audio yet.');
      }
      return nextEpisode;
    } finally {
      setGeneratingId(null);
    }
  };

  const selectEpisode = (episode: PodcastEpisode) => {
    setSelectedEpisodeId(episode.id);
    setCurrentEpisodeId(episode.id);
    window.history.replaceState(null, '', `#${episode.id}`);
  };

  const playEpisode = async (
    episode: PodcastEpisode,
    options: { openDetail?: boolean } = { openDetail: true },
  ) => {
    if (options.openDetail) {
      setSelectedEpisodeId(episode.id);
    }
    setCurrentEpisodeId(episode.id);
    if (playingId === episode.id) {
      setPlayingId(null);
      return;
    }

    try {
      const generated = await ensureGeneratedEpisode(episode);
      setCurrentEpisodeId(generated.id);
      setPlayingId(generated.id);
    } catch (error) {
      setGenerationError(error instanceof Error ? error.message : 'Unable to generate podcast audio.');
      setPlayingId(null);
    }
  };

  const playAll = () => {
    const firstEpisode = podcastData?.episodes[0];
    if (!firstEpisode) return;
    setSelectedEpisodeId(firstEpisode.id);
    setCurrentEpisodeId(firstEpisode.id);
    void playEpisode(firstEpisode);
  };

  const toggleCurrentEpisode = () => {
    if (!currentEpisode) return;
    void playEpisode(currentEpisode, { openDetail: false });
  };

  const seek = (time: number) => {
    const audio = audioRef.current;
    const seekDuration =
      audio && currentEpisode?.audioUrl && Number.isFinite(audio.duration)
        ? audio.duration
        : durationSeconds;
    const nextTime = Math.max(0, Math.min(time, seekDuration));
    if (audio && currentEpisode?.audioUrl) {
      audio.currentTime = nextTime;
    }
    setCurrentTime(nextTime);
  };

  const skip = (delta: number) => {
    const audio = audioRef.current;
    if (audio && currentEpisode?.audioUrl) {
      seek(audio.currentTime + delta);
      return;
    }
    setCurrentTime((time) => Math.max(0, Math.min(time + delta, durationSeconds)));
  };

  const cycleSpeed = () => {
    setPlaybackRate((rate) => {
      const currentIndex = playbackRates.indexOf(rate);
      return playbackRates[(currentIndex + 1) % playbackRates.length];
    });
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <Headphones size={26} />
          <span>Kiwi Podcast</span>
        </div>
        <div className="runtime-status" aria-label="Runtime status">
          <span className={bridge.mode === 'simulator' ? 'status-dot sim' : 'status-dot live'} />
          {bridge.mode === 'simulator' ? 'Simulator' : bridge.connected ? 'Live' : 'Connecting'}
        </div>
      </header>

      {currentEpisode ? (
        <PlayerBar
          currentTime={currentTime}
          duration={durationSeconds}
          episode={currentEpisode}
          isPlaying={playingId === currentEpisode.id}
          onCycleSpeed={cycleSpeed}
          onSeek={seek}
          onSkip={skip}
          onTogglePlay={toggleCurrentEpisode}
          playbackRate={playbackRate}
        />
      ) : null}

      <audio
        ref={audioRef}
        onEnded={() => setPlayingId(null)}
        onLoadedMetadata={(event) => {
          const duration = event.currentTarget.duration;
          setAudioDuration(Number.isFinite(duration) ? duration : null);
        }}
        onDurationChange={(event) => {
          const duration = event.currentTarget.duration;
          setAudioDuration(Number.isFinite(duration) ? duration : null);
        }}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onCanPlay={(event) => {
          const duration = event.currentTarget.duration;
          setAudioDuration(Number.isFinite(duration) ? duration : null);
        }}
      />

      {loadState === 'loading' || loadState === 'idle' ? (
        <div className="center-state">
          <Loader2 className="spin" size={30} />
          <p>Loading podcast episodes</p>
        </div>
      ) : null}

      {loadState === 'error' ? (
        <div className="center-state error">
          <AlertCircle size={32} />
          <p>{loadError}</p>
          <button className="primary-button" type="button" onClick={() => setRefreshKey((key) => key + 1)}>
            Retry
          </button>
        </div>
      ) : null}

      {podcastData && loadState === 'ready' && !selectedEpisode ? (
        <PodcastOverview
          data={podcastData}
          activeEpisodeId={selectedEpisodeId}
          playingId={playingId}
          onSelectEpisode={selectEpisode}
          onPlayAll={playAll}
          onPlayEpisode={playEpisode}
          onRefresh={() => setRefreshKey((key) => key + 1)}
          generatingId={generatingId}
        />
      ) : null}

      {podcastData && selectedEpisode ? (
        <EpisodeDetail
          podcast={podcastData.podcast}
          episode={selectedEpisode}
          isPlaying={playingId === selectedEpisode.id}
          isGenerating={generatingId === selectedEpisode.id}
          generationError={generationError}
          onBack={() => setSelectedEpisodeId(null)}
          onTogglePlay={() => playEpisode(selectedEpisode)}
        />
      ) : null}

      {bridge.error ? (
        <div className="bridge-warning">
          <Radio size={16} />
          {bridge.error}
        </div>
      ) : null}
    </div>
  );
}

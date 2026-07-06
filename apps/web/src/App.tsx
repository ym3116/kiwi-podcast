import { AlertCircle, Headphones, Loader2, Radio } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchClassPodcast } from './api/podcastApi';
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
  const [playbackRate, setPlaybackRate] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
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

  const durationSeconds = useMemo(
    () => durationToSeconds(currentEpisode?.durationLabel),
    [currentEpisode],
  );

  useEffect(() => {
    if (previousEpisodeId.current !== currentEpisodeId) {
      previousEpisodeId.current = currentEpisodeId;
      setCurrentTime(0);
    }
  }, [currentEpisodeId]);

  useEffect(() => {
    if (!playingId || !currentEpisode) return;

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

  const selectEpisode = (episode: PodcastEpisode) => {
    setSelectedEpisodeId(episode.id);
    setCurrentEpisodeId(episode.id);
    window.history.replaceState(null, '', `#${episode.id}`);
  };

  const playEpisode = (episode: PodcastEpisode) => {
    setSelectedEpisodeId(episode.id);
    setCurrentEpisodeId(episode.id);
    setPlayingId((current) => (current === episode.id ? null : episode.id));
  };

  const playAll = () => {
    const firstEpisode = podcastData?.episodes[0];
    if (!firstEpisode) return;
    setSelectedEpisodeId(firstEpisode.id);
    setCurrentEpisodeId(firstEpisode.id);
    setPlayingId(firstEpisode.id);
  };

  const toggleCurrentEpisode = () => {
    if (!currentEpisode) return;
    setPlayingId((current) => (current === currentEpisode.id ? null : currentEpisode.id));
  };

  const seek = (time: number) => {
    setCurrentTime(Math.max(0, Math.min(time, durationSeconds)));
  };

  const skip = (delta: number) => {
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
        />
      ) : null}

      {podcastData && selectedEpisode ? (
        <EpisodeDetail
          podcast={podcastData.podcast}
          episode={selectedEpisode}
          isPlaying={playingId === selectedEpisode.id}
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

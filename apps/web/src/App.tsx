import { AlertCircle, Headphones, Loader2, Radio } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { fetchClassPodcast } from './api/podcastApi';
import { simulatorPodcast } from './bridge/simulator';
import { useKiwiBridge } from './bridge/useKiwiBridge';
import { EpisodeDetail } from './components/EpisodeDetail';
import { PodcastOverview } from './components/PodcastOverview';
import { PodcastEpisode, PodcastResponse } from './types/podcast';

type LoadState = 'idle' | 'loading' | 'ready' | 'error';

export function App() {
  const bridge = useKiwiBridge();
  const [podcastData, setPodcastData] = useState<PodcastResponse | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('idle');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

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
        setPodcastData(data);
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

  const selectEpisode = (episode: PodcastEpisode) => {
    setSelectedEpisodeId(episode.id);
    window.history.replaceState(null, '', `#${episode.id}`);
  };

  const playEpisode = (episode: PodcastEpisode) => {
    setSelectedEpisodeId(episode.id);
    setPlayingId((current) => (current === episode.id ? null : episode.id));
  };

  const playAll = () => {
    const firstEpisode = podcastData?.episodes[0];
    if (!firstEpisode) return;
    setSelectedEpisodeId(firstEpisode.id);
    setPlayingId(firstEpisode.id);
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

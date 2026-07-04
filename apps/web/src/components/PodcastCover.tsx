import { Radio } from 'lucide-react';

interface PodcastCoverProps {
  title: string;
  compact?: boolean;
}

export function PodcastCover({ title, compact = false }: PodcastCoverProps) {
  return (
    <div className={compact ? 'cover cover-compact' : 'cover'} aria-label={`${title} cover`}>
      <div className="cover-mark">
        <Radio size={compact ? 28 : 42} strokeWidth={2.2} />
      </div>
      <div className="cover-title">{title.replace(' - Podcast', '')}</div>
      <div className="cover-footer">Kiwi</div>
    </div>
  );
}

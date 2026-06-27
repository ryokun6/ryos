import { SeekBar } from "../SeekBar";
import { useVideosPlayedSeconds } from "../../hooks/useVideosPlaybackTime";

type VideosSeekBarProps = {
  duration: number;
  onSeek: (time: number) => void;
  isPlaying: boolean;
  isHovered?: boolean;
  onDragChange?: (isDragging: boolean, seekTime?: number) => void;
};

/**
 * Leaf wrapper that subscribes to the playback clock so only the seek bar —
 * not its parent (`VideosVideoPane`, which renders the YouTube player) —
 * re-renders on every ~1Hz progress tick.
 */
export function VideosSeekBar({
  duration,
  onSeek,
  isPlaying,
  isHovered,
  onDragChange,
}: VideosSeekBarProps) {
  const playedSeconds = useVideosPlayedSeconds();
  return (
    <SeekBar
      duration={duration}
      currentTime={playedSeconds}
      onSeek={onSeek}
      isPlaying={isPlaying}
      isHovered={isHovered}
      onDragChange={onDragChange}
    />
  );
}

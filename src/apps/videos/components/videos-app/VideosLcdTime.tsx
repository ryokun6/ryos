import { useVideosElapsedTime } from "../../hooks/useVideosPlaybackTime";

type VideosLcdTimeProps = {
  formatTime: (seconds: number) => string;
  isDraggingSeek: boolean;
  dragSeekTime: number;
};

/**
 * Leaf wrapper that subscribes to the floored playback clock so only the LCD
 * time readout — not the whole `VideosCdPlayerControls` bar — re-renders as
 * the elapsed second ticks over (~1x/sec). While the user is scrubbing it
 * shows the drag target instead.
 */
export function VideosLcdTime({
  formatTime,
  isDraggingSeek,
  dragSeekTime,
}: VideosLcdTimeProps) {
  const elapsedTime = useVideosElapsedTime();
  return (
    <>{formatTime(isDraggingSeek ? Math.floor(dragSeekTime) : elapsedTime)}</>
  );
}

import type { TFunction } from "i18next";
import type ReactPlayer from "react-player";
import type { RefObject } from "react";
import type { Track } from "@/stores/useIpodStore";
import { LyricsSyncMode } from "@/components/shared/LyricsSyncMode";
import type { RomanizationSettings } from "@/types/lyrics";
import { useKaraokeLyricsPlayback } from "./context";

interface SyncModeWindowProps {
  isSyncModeOpen: boolean;
  isFullScreen: boolean;
  currentTrack: Track | null;
  currentIndex: number;
  duration: number;
  romanization: RomanizationSettings;
  setLyricOffset: (index: number, offsetMs: number) => void;
  adjustLyricOffset: (index: number, deltaMs: number) => void;
  playerRef: RefObject<ReactPlayer | null>;
  closeSyncMode: () => void;
  handleRefreshLyrics: () => void;
  showStatus: (message: string) => void;
  t: TFunction;
}

export function KaraokeSyncModeWindowPanel({
  isSyncModeOpen,
  isFullScreen,
  currentTrack,
  currentIndex,
  duration,
  romanization,
  setLyricOffset,
  adjustLyricOffset,
  playerRef,
  closeSyncMode,
  handleRefreshLyrics,
  showStatus,
  t,
}: SyncModeWindowProps) {
  const { lyricsControls, furiganaMap, elapsedTime } = useKaraokeLyricsPlayback();
  if (!isSyncModeOpen || isFullScreen || lyricsControls.originalLines.length === 0) {
    return null;
  }
  return (
    <div className="absolute inset-0 z-40" style={{ borderRadius: "inherit" }}>
      <LyricsSyncMode
        lines={lyricsControls.originalLines}
        currentTimeMs={elapsedTime * 1000}
        durationMs={duration * 1000}
        currentOffset={currentTrack?.lyricOffset ?? 0}
        romanization={romanization}
        furiganaMap={furiganaMap}
        onSetOffset={(offsetMs) => {
          setLyricOffset(currentIndex, offsetMs);
          showStatus(
            `${t("apps.ipod.status.offset")} ${offsetMs >= 0 ? "+" : ""}${(offsetMs / 1000).toFixed(2)}s`
          );
        }}
        onAdjustOffset={(deltaMs) => {
          adjustLyricOffset(currentIndex, deltaMs);
          const newOffset = (currentTrack?.lyricOffset ?? 0) + deltaMs;
          showStatus(
            `${t("apps.ipod.status.offset")} ${newOffset >= 0 ? "+" : ""}${(newOffset / 1000).toFixed(2)}s`
          );
        }}
        onSeek={(timeMs) => {
          playerRef.current?.seekTo(timeMs / 1000);
        }}
        onClose={closeSyncMode}
        onSearchLyrics={handleRefreshLyrics}
      />
    </div>
  );
}

interface SyncModeFullscreenProps {
  isSyncModeOpen: boolean;
  isFullScreen: boolean;
  currentTrack: Track | null;
  currentIndex: number;
  duration: number;
  romanization: RomanizationSettings;
  setLyricOffset: (index: number, offsetMs: number) => void;
  adjustLyricOffset: (index: number, deltaMs: number) => void;
  fullScreenPlayerRef: RefObject<ReactPlayer | null>;
  playerRef: RefObject<ReactPlayer | null>;
  closeSyncMode: () => void;
  handleRefreshLyrics: () => void;
  showStatus: (message: string) => void;
  t: TFunction;
}

export function KaraokeSyncModeFullscreenPanel({
  isSyncModeOpen,
  isFullScreen,
  currentTrack,
  currentIndex,
  duration,
  romanization,
  setLyricOffset,
  adjustLyricOffset,
  fullScreenPlayerRef,
  playerRef,
  closeSyncMode,
  handleRefreshLyrics,
  showStatus,
  t,
}: SyncModeFullscreenProps) {
  const { lyricsControls, furiganaMap, elapsedTime } = useKaraokeLyricsPlayback();
  if (!isSyncModeOpen || !isFullScreen || lyricsControls.originalLines.length === 0) {
    return null;
  }
  return (
    <LyricsSyncMode
      lines={lyricsControls.originalLines}
      currentTimeMs={elapsedTime * 1000}
      durationMs={duration * 1000}
      currentOffset={currentTrack?.lyricOffset ?? 0}
      romanization={romanization}
      furiganaMap={furiganaMap}
      onSetOffset={(offsetMs) => {
        setLyricOffset(currentIndex, offsetMs);
        showStatus(
          `${t("apps.ipod.status.offset")} ${offsetMs >= 0 ? "+" : ""}${(offsetMs / 1000).toFixed(2)}s`
        );
      }}
      onAdjustOffset={(deltaMs) => {
        adjustLyricOffset(currentIndex, deltaMs);
        const newOffset = (currentTrack?.lyricOffset ?? 0) + deltaMs;
        showStatus(
          `${t("apps.ipod.status.offset")} ${newOffset >= 0 ? "+" : ""}${(newOffset / 1000).toFixed(2)}s`
        );
      }}
      onSeek={(timeMs) => {
        const activePlayer = isFullScreen ? fullScreenPlayerRef.current : playerRef.current;
        activePlayer?.seekTo(timeMs / 1000);
      }}
      onClose={closeSyncMode}
      onSearchLyrics={handleRefreshLyrics}
    />
  );
}

import { useCallback, type CSSProperties } from "react";
import type { TFunction } from "i18next";
import { AnimatePresence } from "framer-motion";
import type { Track } from "@/stores/useIpodStore";
import { LyricsDisplay } from "@/apps/ipod/components/lyrics-display/LyricsDisplay";
import { shouldShowKaraokeTitleCard } from "@/apps/karaoke/utils/titleCard";
import type {
  JapaneseFurigana,
  KoreanDisplay,
  LyricsAlignment,
} from "@/types/lyrics";
import { useKaraokeLyricsPlayback } from "./context";
import { KaraokeTitleCard } from "./KaraokeTitleCard";

// Hoisted to module scope so the rendered LyricsDisplay doesn't receive a
// freshly-allocated `containerStyle` prop on every parent render. The values
// are pure CSS strings (no per-render data), so a single shared instance is
// safe.
const FULLSCREEN_CONTAINER_STYLE: CSSProperties = {
  gap: "clamp(0.2rem, calc(min(10vw, 10vh) * 0.08), 1rem)",
  paddingLeft: "env(safe-area-inset-left, 0px)",
  paddingRight: "env(safe-area-inset-right, 0px)",
};

interface FullscreenLyricsProps {
  showLyrics: boolean;
  isPlaying: boolean;
  currentTrack: Track | null;
  coverUrl: string | null;
  isOffline: boolean;
  currentIndex: number;
  adjustLyricOffset: (index: number, delta: number) => void;
  showStatus: (message: string) => void;
  showOfflineStatus: () => void;
  handleNext: () => void;
  handlePrevious: () => void;
  seekToTime: (timeMs: number) => void;
  t: TFunction;
  controlsVisible: boolean;
  koreanDisplay: KoreanDisplay;
  japaneseFurigana: JapaneseFurigana;
  lyricsAlignment: LyricsAlignment;
  /** When set (e.g. fullscreen), replaces default next/previous swipe behavior */
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
}

export function KaraokeFullscreenLyricsOverlay({
  showLyrics,
  isPlaying,
  currentTrack,
  coverUrl,
  isOffline,
  currentIndex,
  adjustLyricOffset,
  showStatus,
  showOfflineStatus,
  handleNext,
  handlePrevious,
  seekToTime,
  t,
  controlsVisible,
  koreanDisplay,
  japaneseFurigana,
  lyricsAlignment,
  onSwipeUp: onSwipeUpOverride,
  onSwipeDown: onSwipeDownOverride,
}: FullscreenLyricsProps) {
  const {
    lyricsControls,
    furiganaMap,
    soramimiMap,
    elapsedTime,
    lyricsFontClassName,
  } = useKaraokeLyricsPlayback();

  const onAdjustOffset = useCallback(
    (delta: number) => {
      adjustLyricOffset(currentIndex, delta);
      const newOffset = (currentTrack?.lyricOffset ?? 0) + delta;
      const sign = newOffset > 0 ? "+" : newOffset < 0 ? "" : "";
      showStatus(`${t("apps.ipod.status.offset")} ${sign}${(newOffset / 1000).toFixed(2)}s`);
      lyricsControls.updateCurrentTimeManually(elapsedTime + newOffset / 1000);
    },
    [
      adjustLyricOffset,
      currentIndex,
      currentTrack?.lyricOffset,
      elapsedTime,
      lyricsControls,
      showStatus,
      t,
    ]
  );

  const currentTimeMs =
    (elapsedTime + (currentTrack?.lyricOffset ?? 0) / 1000) * 1000;
  const showTitleCard = shouldShowKaraokeTitleCard({
    lines: lyricsControls.originalLines,
    currentTimeMs,
    lyricOffsetMs: currentTrack?.lyricOffset ?? 0,
  });

  const bottomPadding = controlsVisible ? "pb-28" : "pb-16";

  if (!showLyrics || !currentTrack) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-10 pointer-events-none" />
      <div className="absolute inset-0 z-20 pointer-events-none" data-lyrics>
        <AnimatePresence>
          {showTitleCard && (
            <KaraokeTitleCard
              title={currentTrack.title}
              artist={currentTrack.artist}
              album={currentTrack.album}
              fontClassName={lyricsFontClassName}
              variant="fullscreen"
              coverUrl={coverUrl}
              bottomPaddingClass={bottomPadding}
              isPlaying={isPlaying}
            />
          )}
        </AnimatePresence>
        {!showTitleCard && (
          <LyricsDisplay
            lines={lyricsControls.lines}
            originalLines={lyricsControls.originalLines}
            currentLine={lyricsControls.currentLine}
            isLoading={lyricsControls.isLoading}
            error={lyricsControls.error}
            visible={true}
            videoVisible={true}
            alignment={lyricsAlignment}
            koreanDisplay={koreanDisplay}
            japaneseFurigana={japaneseFurigana}
            fontClassName={lyricsFontClassName}
            onAdjustOffset={onAdjustOffset}
            onSwipeUp={() => {
              if (onSwipeUpOverride) {
                onSwipeUpOverride();
                return;
              }
              if (isOffline) showOfflineStatus();
              else handleNext();
            }}
            onSwipeDown={() => {
              if (onSwipeDownOverride) {
                onSwipeDownOverride();
                return;
              }
              if (isOffline) showOfflineStatus();
              else handlePrevious();
            }}
            isTranslating={lyricsControls.isTranslating}
            textSizeClass="fullscreen-lyrics-text"
            gapClass="gap-0"
            containerStyle={FULLSCREEN_CONTAINER_STYLE}
            interactive={true}
            bottomPaddingClass={bottomPadding}
            furiganaMap={furiganaMap}
            soramimiMap={soramimiMap}
            currentTimeMs={currentTimeMs}
            showInterludeEllipsis
            onSeekToTime={seekToTime}
            coverUrl={coverUrl}
          />
        )}
      </div>
    </>
  );
}

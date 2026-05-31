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

const windowContainerStyle: CSSProperties = {
  gap: "clamp(0.3rem, 2.5cqw, 1rem)",
};

interface WindowLyricsProps {
  showLyrics: boolean;
  isFullScreen: boolean;
  showControls: boolean;
  anyMenuOpen: boolean;
  isPlaying: boolean;
  coverUrl: string | null;
  isOffline: boolean;
  currentIndex: number;
  adjustLyricOffset: (index: number, delta: number) => void;
  showStatus: (message: string) => void;
  showOfflineStatus: () => void;
  handleNext: () => void;
  handlePrevious: () => void;
  seekToTime: (timeMs: number) => void;
  onOpenCoverFlow?: () => void;
  t: TFunction;
  currentTrack: Track | null;
  koreanDisplay: KoreanDisplay;
  japaneseFurigana: JapaneseFurigana;
  lyricsAlignment: LyricsAlignment;
}

export function KaraokeWindowLyricsOverlay({
  showLyrics,
  isFullScreen,
  showControls,
  anyMenuOpen,
  isPlaying,
  coverUrl,
  isOffline,
  currentIndex,
  adjustLyricOffset,
  showStatus,
  showOfflineStatus,
  handleNext,
  handlePrevious,
  seekToTime,
  onOpenCoverFlow,
  t,
  currentTrack,
  koreanDisplay,
  japaneseFurigana,
  lyricsAlignment,
}: WindowLyricsProps) {
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

  const bottomPadding =
    showControls || anyMenuOpen || !isPlaying ? "pb-20" : "pb-12";

  if (!showLyrics || !currentTrack || isFullScreen) return null;

  return (
    <>
      <div className="absolute inset-0 z-10 bg-black/50 pointer-events-none" />
      <div className="absolute inset-0 z-20 pointer-events-none karaoke-force-font">
        <AnimatePresence>
          {showTitleCard && (
            <KaraokeTitleCard
              title={currentTrack.title}
              artist={currentTrack.artist}
              album={currentTrack.album}
              fontClassName={lyricsFontClassName}
              variant="window"
              coverUrl={coverUrl}
              onOpenCoverFlow={onOpenCoverFlow}
              coverFlowLabel={t("apps.ipod.menu.coverFlow")}
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
              if (isOffline) showOfflineStatus();
              else handleNext();
            }}
            onSwipeDown={() => {
              if (isOffline) showOfflineStatus();
              else handlePrevious();
            }}
            isTranslating={lyricsControls.isTranslating}
            textSizeClass="karaoke-lyrics-text"
            gapClass="gap-1"
            containerStyle={windowContainerStyle}
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

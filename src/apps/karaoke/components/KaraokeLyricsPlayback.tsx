import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  type CSSProperties,
  type MutableRefObject,
  type ReactNode,
} from "react";
import type { TFunction } from "i18next";
import { AnimatePresence, motion } from "framer-motion";
import { useLyrics } from "@/hooks/useLyrics";
import { useFurigana } from "@/hooks/useFurigana";
import { useActivityState, isAnyActivityActive } from "@/hooks/useActivityState";
import { useLyricsErrorToast } from "@/hooks/useLyricsErrorToast";
import { useKaraokeStore } from "@/stores/useKaraokeStore";
import { getEffectiveTranslationLanguage, type Track } from "@/stores/useIpodStore";
import { LyricsDisplay } from "@/apps/ipod/components/LyricsDisplay";
import { LyricsSyncMode } from "@/components/shared/LyricsSyncMode";
import { ActivityIndicatorWithLabel } from "@/components/ui/activity-indicator-with-label";
import {
  getLyricsFontClassName,
  LyricsFont as LyricsFontEnum,
  type JapaneseFurigana,
  type KoreanDisplay,
  type LyricsAlignment,
  type LyricsFont,
  type RomanizationSettings,
} from "@/types/lyrics";
import type ReactPlayer from "react-player";

export interface KaraokeLyricsPlaybackContextValue {
  lyricsControls: ReturnType<typeof useLyrics>;
  furiganaMap: ReturnType<typeof useFurigana>["furiganaMap"];
  soramimiMap: ReturnType<typeof useFurigana>["soramimiMap"];
  activityState: ReturnType<typeof useActivityState>;
  hasActiveActivity: boolean;
  lyricsFontClassName: string;
}

const KaraokeLyricsPlaybackContext = createContext<KaraokeLyricsPlaybackContextValue | null>(
  null
);

export function useKaraokeLyricsPlayback(): KaraokeLyricsPlaybackContextValue {
  const ctx = useContext(KaraokeLyricsPlaybackContext);
  if (!ctx) {
    throw new Error("useKaraokeLyricsPlayback must be used within KaraokeLyricsPlaybackProvider");
  }
  return ctx;
}

interface ProviderProps {
  children: ReactNode;
  currentTrack: Track | null;
  lyricsFont: LyricsFont | undefined;
  romanization: RomanizationSettings;
  lyricsTranslationLanguage: string | null;
  lyricsSourceOverride: Track["lyricsSource"];
  isAddingSong: boolean;
  setIsLyricsSearchDialogOpen: (open: boolean) => void;
  t: TFunction;
  auth?: { username: string; isAuthenticated: boolean };
  lyricsPlaybackSyncRef: MutableRefObject<
    ((timeInLyricsSeconds: number) => void) | null
  >;
}

export function KaraokeLyricsPlaybackProvider({
  children,
  currentTrack,
  lyricsFont,
  romanization,
  lyricsTranslationLanguage,
  lyricsSourceOverride,
  isAddingSong,
  setIsLyricsSearchDialogOpen,
  t,
  auth,
  lyricsPlaybackSyncRef,
}: ProviderProps) {
  const lyricsFontClassName = getLyricsFontClassName(lyricsFont ?? LyricsFontEnum.SerifRed);

  const selectedMatchForLyrics = useMemo(() => {
    if (!lyricsSourceOverride) return undefined;
    return {
      hash: lyricsSourceOverride.hash,
      albumId: lyricsSourceOverride.albumId,
      title: lyricsSourceOverride.title,
      artist: lyricsSourceOverride.artist,
      album: lyricsSourceOverride.album,
    };
  }, [lyricsSourceOverride]);

  const effectiveTranslationLanguage = useMemo(
    () => getEffectiveTranslationLanguage(lyricsTranslationLanguage),
    [lyricsTranslationLanguage]
  );

  const lyricsControls = useLyrics({
    songId: currentTrack?.id ?? "",
    title: currentTrack?.title ?? "",
    artist: currentTrack?.artist ?? "",
    // Karaoke playback time updates frequently. Passing it into `useLyrics` would
    // cause this provider (and any consumers) to re-render on each tick.
    // `LyricsDisplay` already derives the active line/highlight from `currentTimeMs`,
    // so we keep `useLyrics` focused on fetching/translation + manual time updates.
    currentTime: 0,
    translateTo: effectiveTranslationLanguage,
    selectedMatch: selectedMatchForLyrics,
    includeFurigana: true,
    includeSoramimi: true,
    soramimiTargetLanguage: romanization.soramamiTargetLanguage ?? "zh-TW",
    auth,
  });

  useLyricsErrorToast({
    error: lyricsControls.error,
    songId: currentTrack?.id,
    onSearchClick: () => setIsLyricsSearchDialogOpen(true),
    t,
    appId: "karaoke",
  });

  const {
    furiganaMap,
    soramimiMap,
    isFetchingFurigana: isFetchingFuriganaFromHook,
    isFetchingSoramimi,
    furiganaProgress,
    soramimiProgress,
  } = useFurigana({
    songId: currentTrack?.id ?? "",
    lines: lyricsControls.originalLines,
    isShowingOriginal: true,
    romanization,
    prefetchedInfo: lyricsControls.furiganaInfo,
    prefetchedSoramimiInfo: lyricsControls.soramimiInfo,
    auth,
  });

  const activityState = useActivityState({
    lyricsState: {
      isLoading: lyricsControls.isLoading,
      isTranslating: lyricsControls.isTranslating,
      translationProgress: lyricsControls.translationProgress,
    },
    furiganaState: {
      isFetchingFurigana: isFetchingFuriganaFromHook,
      furiganaProgress,
      isFetchingSoramimi,
      soramimiProgress,
    },
    translationLanguage: effectiveTranslationLanguage,
    isAddingSong,
  });

  const hasActiveActivity = isAnyActivityActive(activityState);

  useEffect(() => {
    lyricsPlaybackSyncRef.current = (timeInLyricsSeconds: number) => {
      lyricsControls.updateCurrentTimeManually(timeInLyricsSeconds);
    };
    return () => {
      lyricsPlaybackSyncRef.current = null;
    };
  }, [lyricsControls, lyricsPlaybackSyncRef]);

  const value = useMemo(
    (): KaraokeLyricsPlaybackContextValue => ({
      lyricsControls,
      furiganaMap,
      soramimiMap,
      activityState,
      hasActiveActivity,
      lyricsFontClassName,
    }),
    [
      lyricsControls,
      furiganaMap,
      soramimiMap,
      activityState,
      hasActiveActivity,
      lyricsFontClassName,
    ]
  );

  return (
    <KaraokeLyricsPlaybackContext.Provider value={value}>
      {children}
    </KaraokeLyricsPlaybackContext.Provider>
  );
}

const windowContainerStyle: CSSProperties = {
  gap: "clamp(0.3rem, 2.5cqw, 1rem)",
};

function buildFullscreenContainerStyle(): CSSProperties {
  return {
    gap: "clamp(0.2rem, calc(min(10vw,10vh) * 0.08), 1rem)",
    paddingLeft: "env(safe-area-inset-left, 0px)",
    paddingRight: "env(safe-area-inset-right, 0px)",
  };
}

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
    lyricsFontClassName,
  } = useKaraokeLyricsPlayback();
  const elapsedTime = useKaraokeStore((s) => s.elapsedTime);

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

  const bottomPadding =
    showControls || anyMenuOpen || !isPlaying ? "pb-20" : "pb-12";

  if (!showLyrics || !currentTrack || isFullScreen) return null;

  return (
    <>
      <div className="absolute inset-0 z-10 bg-black/50 pointer-events-none" />
      <div className="absolute inset-0 z-20 pointer-events-none karaoke-force-font">
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
      </div>
    </>
  );
}

interface FullscreenLyricsProps {
  showLyrics: boolean;
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
    lyricsFontClassName,
  } = useKaraokeLyricsPlayback();
  const elapsedTime = useKaraokeStore((s) => s.elapsedTime);

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

  const bottomPadding = controlsVisible ? "pb-28" : "pb-16";

  if (!showLyrics || !currentTrack) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-10 pointer-events-none" />
      <div className="absolute inset-0 z-20 pointer-events-none" data-lyrics>
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
          containerStyle={buildFullscreenContainerStyle()}
          interactive={true}
          bottomPaddingClass={bottomPadding}
          furiganaMap={furiganaMap}
          soramimiMap={soramimiMap}
          currentTimeMs={currentTimeMs}
          showInterludeEllipsis
          onSeekToTime={seekToTime}
          coverUrl={coverUrl}
        />
      </div>
    </>
  );
}

export function KaraokeLyricsActivityIndicator() {
  const { activityState, hasActiveActivity } = useKaraokeLyricsPlayback();
  return (
    <AnimatePresence>
      {hasActiveActivity && (
        <motion.div
          className="absolute top-8 right-6 z-40 pointer-events-none flex justify-end"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          transition={{ duration: 0.2 }}
        >
          <ActivityIndicatorWithLabel size={32} state={activityState} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

interface SyncModeWindowProps {
  isSyncModeOpen: boolean;
  isFullScreen: boolean;
  currentTrack: Track | null;
  currentIndex: number;
  duration: number;
  romanization: RomanizationSettings;
  setLyricOffset: (index: number, offsetMs: number) => void;
  adjustLyricOffset: (index: number, deltaMs: number) => void;
  playerRef: React.RefObject<ReactPlayer | null>;
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
  const { lyricsControls, furiganaMap } = useKaraokeLyricsPlayback();
  const elapsedTime = useKaraokeStore((s) => s.elapsedTime);
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
  fullScreenPlayerRef: React.RefObject<ReactPlayer | null>;
  playerRef: React.RefObject<ReactPlayer | null>;
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
  const { lyricsControls, furiganaMap } = useKaraokeLyricsPlayback();
  const elapsedTime = useKaraokeStore((s) => s.elapsedTime);
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

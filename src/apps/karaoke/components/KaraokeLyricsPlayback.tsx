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
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";
import { AnimatePresence, motion } from "framer-motion";
import { useLyrics } from "@/hooks/useLyrics";
import { useFurigana } from "@/hooks/useFurigana";
import { useActivityState, isAnyActivityActive } from "@/hooks/useActivityState";
import { useLyricsErrorToast } from "@/hooks/useLyricsErrorToast";
import { useCoverPalette } from "@/hooks/useCoverPalette";
import { useKaraokeStore } from "@/stores/useKaraokeStore";
import { getEffectiveTranslationLanguage, type Track } from "@/stores/useIpodStore";
import { LyricsDisplay } from "@/apps/ipod/components/LyricsDisplay";
import { ScrollingText } from "@/apps/ipod/components/screen";
import { LyricsSyncMode } from "@/components/shared/LyricsSyncMode";
import { ActivityIndicatorWithLabel } from "@/components/ui/activity-indicator-with-label";
import { shouldShowKaraokeTitleCard } from "@/apps/karaoke/utils/titleCard";
import {
  getLyricsFontClassName,
  LyricsFont as LyricsFontEnum,
  type JapaneseFurigana,
  type KoreanDisplay,
  type LyricsAlignment,
  type LyricsFont,
  type RomanizationSettings,
} from "@/types/lyrics";
import type { YouTubePlayerHandle as ReactPlayer } from "@/components/shared/YouTubePlayer";

export interface KaraokeLyricsPlaybackContextValue {
  lyricsControls: ReturnType<typeof useLyrics>;
  furiganaMap: ReturnType<typeof useFurigana>["furiganaMap"];
  soramimiMap: ReturnType<typeof useFurigana>["soramimiMap"];
  activityState: ReturnType<typeof useActivityState>;
  hasActiveActivity: boolean;
  elapsedTime: number;
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
  const { i18n } = useTranslation();
  const appLanguage = i18n.resolvedLanguage ?? i18n.language;
  const elapsedTime = useKaraokeStore(useShallow((s) => s.elapsedTime));

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
    [lyricsTranslationLanguage, appLanguage]
  );

  const lyricsControls = useLyrics({
    songId: currentTrack?.id ?? "",
    title: currentTrack?.title ?? "",
    artist: currentTrack?.artist ?? "",
    currentTime: elapsedTime + (currentTrack?.lyricOffset ?? 0) / 1000,
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
      elapsedTime,
      lyricsFontClassName,
    }),
    [
      lyricsControls,
      furiganaMap,
      soramimiMap,
      activityState,
      hasActiveActivity,
      elapsedTime,
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

const TITLE_CARD_BASE_SHADOW = "0 0 6px rgba(0,0,0,0.5), 0 0 6px rgba(0,0,0,0.5)";
const TITLE_CARD_GOLD_GLOW_COLOR_FALLBACK = "#FFD700";
const TITLE_CARD_MOVEMENT_TRANSITION = {
  type: "spring" as const,
  stiffness: 200,
  damping: 30,
  mass: 1,
};

type TitleCardStyleCategory = "outline-blue" | "outline-red" | "glow-white" | "glow-gold" | "glow-gradient";
type TitleCardLineStyle = Pick<
  CSSProperties,
  "color" | "filter" | "lineHeight" | "paintOrder" | "textShadow" | "WebkitTextStroke"
>;

function getTitleCardStyleCategory(className: string): TitleCardStyleCategory {
  if (className.includes("font-lyrics-rounded") && !className.includes("gold-glow")) {
    return "outline-blue";
  }
  if (className.includes("font-lyrics-serif-red")) return "outline-red";
  if (className.includes("font-lyrics-gold-glow")) return "glow-gold";
  if (className.includes("font-lyrics-gradient")) return "glow-gradient";
  return "glow-white";
}

function titleCardHexToRgb(hex: string): [number, number, number] {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!match) return [255, 215, 0];
  return [
    Number.parseInt(match[1]!, 16),
    Number.parseInt(match[2]!, 16),
    Number.parseInt(match[3]!, 16),
  ];
}

function titleCardRgbSaturation(r: number, g: number, b: number): number {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  if (max === min) return 0;
  const lightness = (max + min) / 2;
  return lightness > 0.5
    ? (max - min) / (2 - max - min)
    : (max - min) / (max + min);
}

function pickTitleCardPrimaryColor(palette: string[]): string {
  let best = palette[0] ?? TITLE_CARD_GOLD_GLOW_COLOR_FALLBACK;
  let bestScore = -1;

  for (const hex of palette) {
    const [r, g, b] = titleCardHexToRgb(hex);
    const saturation = titleCardRgbSaturation(r, g, b);
    const lightness = (r + g + b) / (3 * 255);
    const lightnessBoost = 1 - Math.abs(lightness - 0.5) * 2;
    const score = saturation * 0.7 + lightnessBoost * 0.3;
    if (score > bestScore) {
      bestScore = score;
      best = hex;
    }
  }

  return best;
}

function boostTitleCardGlowColor(hex: string): string {
  const [r, g, b] = titleCardHexToRgb(hex);
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  let hue = 0;
  const lightness = (max + min) / 2;
  const delta = max - min;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));

  if (delta !== 0) {
    if (max === rn) hue = ((gn - bn) / delta + 6) % 6;
    else if (max === gn) hue = (bn - rn) / delta + 2;
    else hue = (rn - gn) / delta + 4;
    hue /= 6;
  }

  const boostedSaturation = Math.max(saturation, 0.85);
  const boostedLightness = Math.max(Math.min(lightness, 0.65), 0.55);
  const hslToRgb = (p: number, q: number, t: number) => {
    let nextT = t;
    if (nextT < 0) nextT += 1;
    if (nextT > 1) nextT -= 1;
    if (nextT < 1 / 6) return p + (q - p) * 6 * nextT;
    if (nextT < 1 / 2) return q;
    if (nextT < 2 / 3) return p + (q - p) * (2 / 3 - nextT) * 6;
    return p;
  };
  const q =
    boostedLightness < 0.5
      ? boostedLightness * (1 + boostedSaturation)
      : boostedLightness + boostedSaturation - boostedLightness * boostedSaturation;
  const p = 2 * boostedLightness - q;
  const ro = Math.round(hslToRgb(p, q, hue + 1 / 3) * 255);
  const go = Math.round(hslToRgb(p, q, hue) * 255);
  const bo = Math.round(hslToRgb(p, q, hue - 1 / 3) * 255);
  return `#${ro.toString(16).padStart(2, "0")}${go.toString(16).padStart(2, "0")}${bo.toString(16).padStart(2, "0")}`;
}

function makeTitleCardGlow(hex: string) {
  const [r, g, b] = titleCardHexToRgb(hex);
  return {
    color: hex,
    shadow: `0 0 8px rgba(${r},${g},${b},0.8), 0 0 16px rgba(${r},${g},${b},0.4), 0 0 6px rgba(0,0,0,0.5)`,
    filter: `drop-shadow(0 0 8px rgba(${r},${g},${b},0.5))`,
    baseColor: `rgba(${r},${g},${b},0.6)`,
  };
}

function buildFullscreenContainerStyle(): CSSProperties {
  return {
    gap: "clamp(0.2rem, calc(min(10vw,10vh) * 0.08), 1rem)",
    paddingLeft: "env(safe-area-inset-left, 0px)",
    paddingRight: "env(safe-area-inset-right, 0px)",
  };
}

function KaraokeTitleCard({
  title,
  artist,
  album,
  fontClassName,
  variant,
  coverUrl,
  onOpenCoverFlow,
  coverFlowLabel,
  bottomPaddingClass = "pb-12",
  isPlaying,
}: {
  title: string;
  artist?: string;
  album?: string;
  fontClassName: string;
  variant: "window" | "fullscreen";
  coverUrl?: string | null;
  onOpenCoverFlow?: () => void;
  coverFlowLabel?: string;
  bottomPaddingClass?: string;
  isPlaying: boolean;
}) {
  const styleCategory = getTitleCardStyleCategory(fontClassName);
  const palette = useCoverPalette(styleCategory === "glow-gold" ? (coverUrl ?? null) : null);
  const primaryGlow = useMemo(
    () => makeTitleCardGlow(boostTitleCardGlowColor(pickTitleCardPrimaryColor(palette))),
    [palette]
  );
  const titleTextSizeClass =
    variant === "fullscreen"
      ? "karaoke-title-card-title-fullscreen"
      : "karaoke-title-card-title-window";
  const secondaryTextSizeClass =
    variant === "fullscreen"
      ? "karaoke-title-card-secondary-fullscreen"
      : "karaoke-title-card-secondary-window";
  const secondaryTextStyle: CSSProperties = {
    lineHeight: 1.1,
    opacity: 0.55,
  };
  const coverImageStyle: CSSProperties = {
    width:
      variant === "fullscreen"
        ? "clamp(120px, min(24vw, 24vh), 320px)"
        : "clamp(96px, 18cqw, 220px)",
    height:
      variant === "fullscreen"
        ? "clamp(120px, min(24vw, 24vh), 320px)"
        : "clamp(96px, 18cqw, 220px)",
  };
  const coverSleeveStyle: CSSProperties = {
    background: "#1a1a1a",
    borderRadius: "1%",
    boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
  };
  const titleCardContentStyle: CSSProperties = {
    gap:
      variant === "fullscreen"
        ? "clamp(22px, min(5vw, 5vh), 64px)"
        : "clamp(22px, 5cqw, 64px)",
  };
  const titleCardOuterStyle: CSSProperties = {
    paddingLeft:
      variant === "fullscreen"
        ? "clamp(24px, min(6vw, 6vh), 80px)"
        : "clamp(24px, 6cqw, 80px)",
  };
  const regularTextStyle = useMemo((): TitleCardLineStyle => {
    switch (styleCategory) {
      case "outline-blue":
      case "outline-red":
        return {
          color: "#fff",
          lineHeight: 1,
          WebkitTextStroke: "0.12em rgba(0,0,0,0.7)",
          paintOrder: "stroke fill",
          textShadow: "none",
        };
      case "glow-gold":
        return {
          color: primaryGlow.baseColor,
          lineHeight: 1,
          textShadow: TITLE_CARD_BASE_SHADOW,
          filter: "none",
        };
      case "glow-gradient":
      default:
        return {
          color: "rgba(255, 255, 255, 0.78)",
          lineHeight: 1,
          textShadow: TITLE_CARD_BASE_SHADOW,
        };
    }
  }, [primaryGlow, styleCategory]);
  const metadataLines = useMemo(() => {
    const values: string[] = [];
    for (const value of [artist, album]) {
      const trimmed = value?.trim();
      if (!trimmed) continue;
      if (values.some((existing) => existing.toLocaleLowerCase() === trimmed.toLocaleLowerCase())) {
        continue;
      }
      values.push(trimmed);
    }
    return values;
  }, [album, artist]);

  return (
    <motion.div
      key="karaoke-title-card"
      className={`absolute inset-0 z-40 pointer-events-none flex items-end justify-center pr-8 text-left text-white select-none ${bottomPaddingClass}`}
      style={titleCardOuterStyle}
      initial={{ opacity: 1 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.03 }}
      transition={{ duration: 0.28 }}
    >
      <motion.div
        layout="position"
        transition={TITLE_CARD_MOVEMENT_TRANSITION}
        className="w-full max-w-none flex items-center justify-start"
        style={titleCardContentStyle}
      >
        {coverUrl && (
          <div className="relative shrink-0" style={coverImageStyle}>
            {onOpenCoverFlow && (
              <button
                type="button"
                aria-label={coverFlowLabel}
                title={coverFlowLabel}
                className="absolute inset-0 z-10 p-0 border-0 bg-transparent cursor-pointer pointer-events-auto"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenCoverFlow();
                }}
                onMouseDown={(e) => e.stopPropagation()}
                onMouseUp={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
                onTouchEnd={(e) => e.stopPropagation()}
              />
            )}
            <div className="absolute inset-0 overflow-hidden" style={coverSleeveStyle}>
              <img
                src={coverUrl}
                alt=""
                className="w-full h-full object-cover"
                draggable={false}
              />
            </div>
            <div
              className="absolute top-full left-0 w-full pointer-events-none"
              style={{ height: "50%" }}
            >
              <img
                src={coverUrl}
                alt=""
                className="w-full h-auto"
                style={{
                  transform: "scaleY(-1)",
                  opacity: 0.3,
                  maskImage: "linear-gradient(to top, rgba(0,0,0,1) 0%, transparent 50%)",
                  WebkitMaskImage: "linear-gradient(to top, rgba(0,0,0,1) 0%, transparent 50%)",
                  borderRadius: "1%",
                }}
                draggable={false}
              />
            </div>
          </div>
        )}
        <div className="min-w-0 flex-1 text-left overflow-hidden">
          <ScrollingText
            text={title}
            align="left"
            fadeEdges
            isPlaying={isPlaying}
            scrollStartDelaySec={1}
            className={`${titleTextSizeClass} ${fontClassName} w-full max-w-full`}
            style={regularTextStyle}
          />
          {metadataLines.map((metadataLine) => (
            <div
              key={metadataLine}
              className={`text-white ${secondaryTextSizeClass} ${fontClassName} whitespace-pre-wrap break-words`}
              style={secondaryTextStyle}
            >
              {metadataLine}
            </div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
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
        )}
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

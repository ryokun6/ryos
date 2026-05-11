import {
  useRef,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  useCallback,
  type CSSProperties,
} from "react";
import ReactPlayer from "react-player";
import { motion, AnimatePresence } from "framer-motion";
import { Shuffle } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { useAudioSettingsStore } from "@/stores/useAudioSettingsStore";
import { LyricsDisplay } from "./LyricsDisplay";
import {
  AppleMusicPlayerBridge,
} from "./AppleMusicPlayerBridge";
import { ActivityIndicatorWithLabel } from "@/components/ui/activity-indicator-with-label";
import { useTranslation } from "react-i18next";
import {
  BatteryIndicator,
  Scrollbar,
  MenuListItem,
  ScrollingText,
  StatusDisplay,
} from "./screen";
import {
  PLAYER_PROGRESS_INTERVAL_MS,
  getYouTubeVideoId,
  formatKugouImageUrl,
} from "../constants";
import { DisplayMode } from "@/types/lyrics";
import { LandscapeVideoBackground } from "@/components/shared/LandscapeVideoBackground";
import { AmbientBackground } from "@/components/shared/AmbientBackground";
import { MeshGradientBackground } from "@/components/shared/MeshGradientBackground";
import { WaterBackground } from "@/components/shared/WaterBackground";
import type { IpodScreenProps } from "../types";
import { useIpodStore, isAppleMusicCollectionTrack } from "@/stores/useIpodStore";
import { useThemeStore } from "@/stores/useThemeStore";

// Fixed row height for the iPod menu list. Each `MenuListItem` is a
// single-line row; the classic skin's Chicago glyphs need 24px row height at
// 16px type, while the modern (color) skin fits **24px** rows with **15px**
// Myriad / system UI to match nano 6G/7G density without touching classic.
//
// We virtualize EVERY menu — not just huge ones — so item geometry
// stays identical across the main menu, the artist list, and the
// thousands-long All Songs list. Without this, the All Songs view
// (virtualized at a fixed height) would render at a different row size
// than the surrounding menus (whose rows used the font's natural
// height) and the menu would visibly "shrink" when entering it.
//
// Both heights are constants — the variant is global state, not a
// per-menu choice, so a single value applies cleanly to all menus and
// the scroll-position math.
const MENU_ITEM_HEIGHT_CLASSIC = 24;
const MENU_ITEM_HEIGHT_MODERN = 24;
// Zune reuses the same 24px row rhythm as classic/modern so the shared
// virtualization geometry (scroll offsets, item snapping) doesn't have to
// branch on variant.
const MENU_ITEM_HEIGHT_ZUNE = 24;
// Modern titlebar matches the row height exactly so the menu reads as
// a single continuous list and the silver header doesn't feel chunkier
// than the content below.
const MODERN_TITLEBAR_HEIGHT = MENU_ITEM_HEIGHT_MODERN;
const ZUNE_TITLEBAR_HEIGHT = MENU_ITEM_HEIGHT_ZUNE;
// Render this many extra items above and below the visible window so
// scrolling doesn't reveal blank rows before React reconciles.
const OVERSCAN_ITEMS = 6;

function formatPlaybackTime(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(safeSeconds / 60)}:${String(safeSeconds % 60).padStart(
    2,
    "0"
  )}`;
}


/** `rotateY` + perspective for left↔right foreshortening; Karaoke-style reflection stacking. */
const MODERN_NOW_PLAYING_ART_PX = 54;
const MODERN_NOW_PLAYING_SLEEVE: CSSProperties = {
  background: "#1a1a1a",
  borderRadius: "3px",
};
const MODERN_NOW_PLAYING_REFLECT_IMG: CSSProperties = {
  transform: "scaleY(-1)",
  opacity: 0.36,
  maskImage:
    "linear-gradient(to top, rgba(0, 0, 0, 1) 0%, transparent 50%)",
  WebkitMaskImage:
    "linear-gradient(to top, rgba(0, 0, 0, 1) 0%, transparent 50%)",
  borderRadius: "3px",
};
const MODERN_NOW_PLAYING_3D_PERSPECTIVE_PX = 180;
/** Left→right perspective (rotate around vertical axis). Negate angle to mirror. */
const MODERN_NOW_PLAYING_ROTATE_Y = "15deg";

const MODERN_NOW_PLAYING_ART_3D: CSSProperties = {
  transformStyle: "preserve-3d",
  transform: `rotateY(${MODERN_NOW_PLAYING_ROTATE_Y})`,
  transformOrigin: "center center",
  width: MODERN_NOW_PLAYING_ART_PX,
};

/** Sleeve + reflection in one `preserve-3d` group tipped with rotateY + perspective. */
function ModernNowPlayingArtwork({ coverUrl }: { coverUrl: string | null }) {
  const reflectH = MODERN_NOW_PLAYING_ART_PX * 0.5;

  return (
    <div
      className="relative shrink-0 self-start overflow-visible"
      style={{
        width: MODERN_NOW_PLAYING_ART_PX,
        height: MODERN_NOW_PLAYING_ART_PX,
        perspective: `${MODERN_NOW_PLAYING_3D_PERSPECTIVE_PX}px`,
        perspectiveOrigin: "50% 70%",
      }}
    >
      <div style={MODERN_NOW_PLAYING_ART_3D}>
        <div
          className="relative overflow-hidden"
          style={{
            ...MODERN_NOW_PLAYING_SLEEVE,
            height: MODERN_NOW_PLAYING_ART_PX,
            width: MODERN_NOW_PLAYING_ART_PX,
          }}
        >
          {coverUrl ? (
            <img
              src={coverUrl}
              alt=""
              draggable={false}
              className="size-full object-cover"
            />
          ) : (
            <div className="flex size-full items-center justify-center bg-gradient-to-br from-neutral-600 to-neutral-900 text-[22px] leading-none text-white/25 select-none">
              ♪
            </div>
          )}
        </div>
        {coverUrl ? (
          <div
            aria-hidden
            className="pointer-events-none mt-0 w-full overflow-hidden"
            style={{ height: reflectH }}
          >
            <img
              src={coverUrl}
              alt=""
              draggable={false}
              className="block w-full h-auto"
              style={MODERN_NOW_PLAYING_REFLECT_IMG}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

// Animation variants for menu transitions
const menuVariants = {
  enter: (direction: "forward" | "backward") => ({
    x: direction === "forward" ? "100%" : "-100%",
  }),
  center: {
    x: 0,
  },
  exit: (direction: "forward" | "backward") => ({
    x: direction === "forward" ? "-100%" : "100%",
  }),
};

export function IpodScreen({
  currentTrack,
  isPlaying,
  elapsedTime,
  totalTime,
  menuMode,
  menuHistory,
  selectedMenuItem,
  onSelectMenuItem,
  currentIndex,
  tracksLength,
  backlightOn,
  menuDirection,
  onMenuItemAction,
  showVideo,
  displayMode,
  playerRef,
  handleTrackEnd,
  handleProgress,
  handleDuration,
  handlePlay,
  handlePause,
  handleReady,
  loopCurrent,
  isShuffled,
  statusMessage,
  onToggleVideo,
  lcdFilterOn,
  ipodVolume,
  showStatusCallback,
  showLyrics,
  lyricsAlignment,
  koreanDisplay,
  japaneseFurigana,
  lyricOffset,
  adjustLyricOffset,
  registerActivity,
  isFullScreen,
  lyricsControls,
  onNextTrack,
  onPreviousTrack,
  furiganaMap,
  soramimiMap,
  activityState,
}: IpodScreenProps) {
  const { t } = useTranslation();
  
  const isAnyActivityActive = activityState.isLoadingLyrics || 
    activityState.isTranslating || 
    activityState.isFetchingFurigana || 
    activityState.isFetchingSoramimi || 
    activityState.isAddingSong;

  // Current menu title
  const currentMenuTitle = menuMode
    ? menuHistory.length > 0
      ? menuHistory[menuHistory.length - 1].displayTitle ??
        menuHistory[menuHistory.length - 1].title
      : t("apps.ipod.menuItems.ipod")
    : t("apps.ipod.menuItems.nowPlaying");

  // Refs
  //
  // The menu motion.div uses a `key` that changes on every navigation,
  // so AnimatePresence remounts it each time the user enters a new
  // menu. With `mode="sync"` the OLD menu sticks around for ~200ms
  // while its exit animation plays, and the NEW menu mounts on top.
  // Both inner scroll containers point at the same `menuScrollRef`:
  //   1. New menu mounts → React sets ref.current = newDiv ✓
  //   2. ~200ms later, old menu finishes exiting → React calls the
  //      ref cleanup for the OLD div → ref.current = null ✗
  // After step 2, every wheel-scroll attempt early-exits because the
  // ref is null. Use a callback ref that stores the latest mounted
  // node and ignores null clears from the unmounting old menu — the
  // ref then always points at the current menu's container.
  const menuScrollRef = useRef<HTMLDivElement | null>(null);
  const setMenuScrollRef = useCallback((el: HTMLDivElement | null) => {
    if (el) menuScrollRef.current = el;
  }, []);

  const masterVolume = useAudioSettingsStore((s) => s.masterVolume);
  const finalIpodVolume = ipodVolume * masterVolume;
  const isAppleMusicTrack = currentTrack?.source === "appleMusic";
  const isAppleMusicCollectionShell =
    isAppleMusicCollectionTrack(currentTrack);
  const collectionShellKey =
    currentTrack?.appleMusicPlayParams?.stationId ??
    currentTrack?.appleMusicPlayParams?.playlistId ??
    null;
  const appleMusicKitNowPlaying = useIpodStore((s) => s.appleMusicKitNowPlaying);
  const setAppleMusicKitNowPlaying = useIpodStore(
    (s) => s.setAppleMusicKitNowPlaying
  );
  // iOS-6 inspired modern skin (color screen + Helvetica Neue + glossy
  // blue gradients) vs. classic monochrome iPod LCD. Read directly from
  // the store so the parent doesn't have to thread one more prop, and so
  // toggling from the menubar updates the screen instantly.
  const storedUiVariant = useIpodStore((s) => s.uiVariant);
  // The Zune skin is auto-applied for the Windows XP and Windows 98 OS
  // themes — it does not appear under System 7 or macOS Aqua. Computed
  // here so the entire screen subtree (titlebar, rows, scrollbar,
  // battery, status overlay, now-playing) themes from a single source.
  const osTheme = useThemeStore((s) => s.current);
  const isXpOrWin98Theme = osTheme === "xp" || osTheme === "win98";
  const effectiveUiVariant: "classic" | "modern" | "zune" = isXpOrWin98Theme
    ? "zune"
    : storedUiVariant;
  const uiVariant = effectiveUiVariant;
  const isModernUi = effectiveUiVariant === "modern";
  const isZuneUi = effectiveUiVariant === "zune";
  const menuItemHeight = isZuneUi
    ? MENU_ITEM_HEIGHT_ZUNE
    : isModernUi
    ? MENU_ITEM_HEIGHT_MODERN
    : MENU_ITEM_HEIGHT_CLASSIC;
  const [showShellTitleInTitlebar, setShowShellTitleInTitlebar] =
    useState(false);
  const effectiveDisplayMode =
    isAppleMusicTrack && displayMode === DisplayMode.Video
      ? DisplayMode.Cover
      : displayMode;
  const shouldAnimateVisuals = showVideo && isPlaying;

  useEffect(() => {
    setShowShellTitleInTitlebar(false);
  }, [collectionShellKey]);

  useEffect(() => {
    if (!collectionShellKey || menuMode || !isPlaying) {
      setShowShellTitleInTitlebar(false);
      return;
    }
    const intervalId = window.setInterval(() => {
      setShowShellTitleInTitlebar((show) => !show);
    }, 5000);
    return () => window.clearInterval(intervalId);
  }, [isPlaying, menuMode, collectionShellKey]);

  const nowPlayingDisplayTrack = useMemo(() => {
    if (!currentTrack || !isAppleMusicCollectionShell || !appleMusicKitNowPlaying) {
      return currentTrack;
    }
    return {
      ...currentTrack,
      title: appleMusicKitNowPlaying.title,
      artist: appleMusicKitNowPlaying.artist ?? currentTrack.artist,
      album: appleMusicKitNowPlaying.album,
      cover: appleMusicKitNowPlaying.cover ?? currentTrack.cover,
    };
  }, [appleMusicKitNowPlaying, currentTrack, isAppleMusicCollectionShell]);

  const titlebarTitle =
    !menuMode &&
    isAppleMusicCollectionShell &&
    isPlaying &&
    showShellTitleInTitlebar &&
    currentTrack?.title
      ? currentTrack.title
      : currentMenuTitle;
  const displayDurationSeconds = Math.max(0, Math.floor(totalTime));
  const displayElapsedSeconds = Math.max(
    0,
    Math.min(displayDurationSeconds, Math.floor(elapsedTime))
  );
  const displayRemainingSeconds = Math.max(
    0,
    displayDurationSeconds - displayElapsedSeconds
  );

  // Cover URL for paused state overlay
  const coverUrl = useMemo(() => {
    if (!nowPlayingDisplayTrack) return null;
    if (isAppleMusicTrack) {
      // Apple Music supplies an https URL directly; no Kugou template here.
      return nowPlayingDisplayTrack.cover ?? null;
    }
    const videoId = getYouTubeVideoId(nowPlayingDisplayTrack.url);
    const youtubeThumbnail = videoId
      ? `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
      : null;
    return (
      formatKugouImageUrl(nowPlayingDisplayTrack.cover, 400) ?? youtubeThumbnail
    );
  }, [isAppleMusicTrack, nowPlayingDisplayTrack]);

  // Current menu items (the deepest menu in the history stack).
  const currentMenuItems = useMemo(
    () =>
      menuMode && menuHistory.length > 0
        ? menuHistory[menuHistory.length - 1].items
        : [],
    [menuMode, menuHistory]
  );

  // Track scroll position + container height so we can compute the
  // visible window for virtualization.
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);

  useEffect(() => {
    const el = menuScrollRef.current;
    if (!el) return;
    const handleScroll = () => setScrollTop(el.scrollTop);
    const handleResize = () => setContainerHeight(el.clientHeight);
    handleScroll();
    handleResize();
    el.addEventListener("scroll", handleScroll, { passive: true });
    const ro = new ResizeObserver(handleResize);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", handleScroll);
      ro.disconnect();
    };
  }, [menuMode, currentMenuItems]);

  const visibleRange = useMemo(() => {
    const start = Math.max(
      0,
      Math.floor(scrollTop / menuItemHeight) - OVERSCAN_ITEMS
    );
    const visibleCount =
      Math.ceil((containerHeight || 124) / menuItemHeight) +
      OVERSCAN_ITEMS * 2;
    const end = Math.min(currentMenuItems.length, start + visibleCount);
    return { start, end };
  }, [scrollTop, containerHeight, currentMenuItems.length, menuItemHeight]);

  // Keep the selected item in view. We key on `menuHistory` (the array
  // reference, not just its length) so EVERY menu transition triggers a
  // scroll re-evaluation, even when:
  //   - The previous and next menus happen to have the same length, OR
  //   - The previous and next menus happen to use the same
  //     `selectedMenuItem` value (e.g. both default to 0).
  // Without this, navigating between, say, two equally-deep artist
  // submenus left the menu scrolled to the previous menu's offset.
  // Using useLayoutEffect prevents a flicker where the user briefly
  // sees the wrong scroll position before the correction lands.
  const lastMenuDepthRef = useRef(menuHistory.length);
  useLayoutEffect(() => {
    const el = menuScrollRef.current;
    if (!el) return;
    if (!menuMode || currentMenuItems.length === 0) {
      lastMenuDepthRef.current = menuHistory.length;
      return;
    }

    const isMenuTransition = lastMenuDepthRef.current !== menuHistory.length;
    lastMenuDepthRef.current = menuHistory.length;

    const containerH = el.clientHeight || 124;

    // On a menu transition, snap scrollTop based purely on the target
    // index — we don't want to inherit the previous menu's offset.
    //
    // Match classic iPod list behavior: restore the selected row at the
    // nearest viewport edge (top for early rows, bottom for deeper rows),
    // not centered with extra context around it.
    if (isMenuTransition) {
      const safeIndex = Math.max(
        0,
        Math.min(selectedMenuItem, currentMenuItems.length - 1)
      );
      const itemTop = safeIndex * menuItemHeight;
      const itemBottom = itemTop + menuItemHeight;
      const target = itemBottom > containerH ? itemBottom - containerH : 0;
      el.scrollTop = target;
      setScrollTop(target);
      return;
    }

    // Within the same menu (e.g. wheel scrolling), only nudge the
    // scroll when the selection has gone off-screen.
    if (selectedMenuItem < 0 || selectedMenuItem >= currentMenuItems.length) {
      return;
    }
    const itemTop = selectedMenuItem * menuItemHeight;
    const itemBottom = itemTop + menuItemHeight;
    const visibleTop = el.scrollTop;
    const visibleBottom = visibleTop + containerH;
    if (itemBottom > visibleBottom) {
      el.scrollTop = itemBottom - containerH;
    } else if (itemTop < visibleTop) {
      el.scrollTop = itemTop;
    }
  }, [menuMode, selectedMenuItem, menuHistory, currentMenuItems, menuItemHeight]);

  const shouldShowLyrics = showLyrics;

  return (
    <div
      className={cn(
        "relative w-full h-[150px] border border-black border-2 rounded-[2px] overflow-hidden transition-all duration-500 select-none no-select-all",
        // The classic LCD filter scan-lines/flicker overlay only makes
        // sense for the monochrome 1st-gen LCD look. The modern iOS 6
        // skin and Zune skin are rendered on flat color displays, so we
        // skip the CRT-style filter even when the underlying setting
        // is enabled.
        lcdFilterOn && !isModernUi && !isZuneUi ? "lcd-screen" : "",
        isZuneUi
          ? // Pure black Zune canvas; LCD reflection/scan-lines are
            // intentionally suppressed so the white type stays crisp.
            "ipod-zune-screen bg-black"
          : isModernUi
          ? // White table surface; avoid neutral chassis fills—they read as
            // gray stripes under the virtualized list and in empty space.
            "ipod-modern-screen bg-white"
          : backlightOn
          ? "bg-[#c5e0f5] bg-gradient-to-b from-[#d1e8fa] to-[#e0f0fc]"
          : "bg-[#8a9da9] contrast-65 saturate-50",
        lcdFilterOn &&
          backlightOn &&
          !isModernUi &&
          !isZuneUi &&
          "shadow-[0_0_10px_2px_rgba(197,224,245,0.05)]"
      )}
      style={{
        minWidth: "100%",
        minHeight: "150px",
        maxWidth: "100%",
        maxHeight: "150px",
        position: "relative",
        contain: "layout style paint",
        WebkitUserSelect: "none",
        WebkitTouchCallout: "none",
      }}
    >
      {/* LCD screen overlay with scan lines (classic skin only) */}
      {lcdFilterOn && !isModernUi && !isZuneUi && (
        <div className="absolute inset-0 pointer-events-none z-25 lcd-scan-lines"></div>
      )}

      {/* Glass reflection effect (classic skin only) */}
      {lcdFilterOn && !isModernUi && !isZuneUi && (
        <div className="absolute inset-0 pointer-events-none z-25 lcd-reflection"></div>
      )}

      {/* Video & Lyrics Overlay */}
      {currentTrack && (
        <div
          className={cn(
            "absolute inset-0 transition-opacity duration-300 overflow-hidden",
            menuMode ? "z-0" : "z-20",
            menuMode || !showVideo
              ? "opacity-0 pointer-events-none"
              : "opacity-100"
          )}
        >
          <div
            className="w-full h-[calc(100%+300px)] mt-[-150px]"
            onClick={(e) => {
              e.stopPropagation();
              registerActivity();
              if (!isPlaying) {
                if (!showVideo) {
                  onToggleVideo();
                  setTimeout(() => {
                    handlePlay();
                  }, 100);
                } else {
                  handlePlay();
                }
              } else {
                onToggleVideo();
              }
            }}
          >
            {/* Player — swaps between YouTube (ReactPlayer) and Apple Music
                (MusicKit bridge) based on the active track's source. The
                YouTube embed is hidden when display mode is not Video, but
                still provides audio. */}
            {isAppleMusicTrack ? (
              <AppleMusicPlayerBridge
                ref={playerRef as unknown as React.RefObject<never>}
                currentTrack={currentTrack}
                playing={isPlaying && !isFullScreen}
                resumeAtSeconds={elapsedTime}
                volume={finalIpodVolume}
                onProgress={!isFullScreen ? handleProgress : undefined}
                onDuration={!isFullScreen ? handleDuration : undefined}
                onPlay={!isFullScreen ? handlePlay : undefined}
                onPause={!isFullScreen ? handlePause : undefined}
                onEnded={!isFullScreen ? handleTrackEnd : undefined}
                onReady={!isFullScreen ? handleReady : undefined}
                onNowPlayingItemChange={setAppleMusicKitNowPlaying}
              />
            ) : (
              <div
                className="w-full h-full"
                style={
                  effectiveDisplayMode !== DisplayMode.Video
                    ? { visibility: "hidden", pointerEvents: "none" }
                    : undefined
                }
              >
                <ReactPlayer
                  ref={playerRef}
                  url={currentTrack.url}
                  playing={isPlaying}
                  controls={
                    showVideo && effectiveDisplayMode === DisplayMode.Video
                  }
                  width="100%"
                  height="100%"
                  onEnded={!isFullScreen ? handleTrackEnd : undefined}
                  onProgress={!isFullScreen ? handleProgress : undefined}
                  onDuration={!isFullScreen ? handleDuration : undefined}
                  onPlay={!isFullScreen ? handlePlay : undefined}
                  onPause={!isFullScreen ? handlePause : undefined}
                  onReady={!isFullScreen ? handleReady : undefined}
                  loop={loopCurrent}
                  volume={finalIpodVolume}
                  playsinline={true}
                  progressInterval={PLAYER_PROGRESS_INTERVAL_MS}
                  config={{
                    youtube: {
                      playerVars: {
                        modestbranding: 1,
                        rel: 0,
                        showinfo: 0,
                        iv_load_policy: 3,
                        fs: 0,
                        disablekb: 1,
                        playsinline: 1,
                        enablejsapi: 1,
                        origin: window.location.origin,
                      },
                      embedOptions: {
                        referrerPolicy: "strict-origin-when-cross-origin",
                      },
                    },
                  }}
                />
              </div>
            )}

            {/* Landscape video background */}
            {effectiveDisplayMode === DisplayMode.Landscapes && shouldAnimateVisuals && (
              <LandscapeVideoBackground
                isActive={shouldAnimateVisuals}
                className="absolute inset-0 z-[5]"
              />
            )}

            {/* Warp shader background */}
            {effectiveDisplayMode === DisplayMode.Shader && shouldAnimateVisuals && (
              <AmbientBackground
                coverUrl={coverUrl}
                variant="warp"
                isActive={shouldAnimateVisuals}
                className="absolute inset-0 z-[5]"
              />
            )}

            {/* Mesh gradient background */}
            {effectiveDisplayMode === DisplayMode.Mesh && shouldAnimateVisuals && (
              <MeshGradientBackground
                coverUrl={coverUrl}
                isActive={shouldAnimateVisuals}
                className="absolute inset-0 z-[5]"
              />
            )}

            {/* Water shader background */}
            {effectiveDisplayMode === DisplayMode.Water && shouldAnimateVisuals && (
              <WaterBackground
                coverUrl={coverUrl}
                isActive={shouldAnimateVisuals}
                className="absolute inset-0 z-[5]"
              />
            )}

            {/* Dark overlay when lyrics are shown */}
            {showVideo && shouldShowLyrics && (
              <div className="absolute inset-0 bg-black/30 z-25" />
            )}
            {/* Cover overlay: shows when paused (any mode) or in Cover mode.
                Apple Music still gets animated visualizers in non-cover modes. */}
            <AnimatePresence>
              {showVideo &&
                coverUrl &&
                (effectiveDisplayMode === DisplayMode.Cover || !isPlaying) && (
                <motion.div
                  className="absolute inset-0 z-15"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePlay();
                  }}
                >
                  <motion.img
                    src={coverUrl}
                    alt={currentTrack?.title}
                    className="w-full h-full object-cover brightness-50 pointer-events-none"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                  />
                </motion.div>
              )}
            </AnimatePresence>
            {/* Transparent overlay to capture clicks */}
            {showVideo && (
              <div
                className="absolute inset-0 z-30"
                onClick={(e) => {
                  e.stopPropagation();
                  if (!isPlaying) {
                    handlePlay();
                  } else {
                    onToggleVideo();
                  }
                }}
              />
            )}
            {/* Status Display */}
            <AnimatePresence>
              {statusMessage && (
                <motion.div
                  className="absolute inset-0 z-40"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <StatusDisplay message={statusMessage} variant={uiVariant} />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Activity Indicator */}
            <AnimatePresence>
              {isAnyActivityActive && (
                <motion.div
                  className="absolute top-4 right-4 z-40 pointer-events-none"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.2 }}
                >
                  <ActivityIndicatorWithLabel
                    size="md"
                    state={activityState}
                  />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Lyrics Overlay */}
            <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 35 }}>
            <LyricsDisplay
              lines={lyricsControls.lines}
              originalLines={lyricsControls.originalLines}
              currentLine={lyricsControls.currentLine}
              isLoading={lyricsControls.isLoading}
              error={lyricsControls.error}
              visible={shouldShowLyrics}
              videoVisible={showVideo}
              alignment={lyricsAlignment}
              koreanDisplay={koreanDisplay}
              japaneseFurigana={japaneseFurigana}
              isTranslating={lyricsControls.isTranslating}
              onAdjustOffset={(deltaMs) => {
                adjustLyricOffset(deltaMs);
                const newOffset = lyricOffset + deltaMs;
                const sign = newOffset > 0 ? "+" : newOffset < 0 ? "" : "";
                showStatusCallback(
                  `${t("apps.ipod.status.offset")} ${sign}${(newOffset / 1000).toFixed(2)}s`
                );
                const updatedTime = elapsedTime + newOffset / 1000;
                lyricsControls.updateCurrentTimeManually(updatedTime);
              }}
              onSwipeUp={onNextTrack}
              onSwipeDown={onPreviousTrack}
              furiganaMap={furiganaMap}
              soramimiMap={soramimiMap}
              currentTimeMs={(elapsedTime + lyricOffset / 1000) * 1000}
              coverUrl={coverUrl}
            />
            </div>
          </div>
        </div>
      )}

      {/* Title bar */}
      <div
        className={cn(
          // Header height differs by skin:
          //   - Classic: 24px (h-6) — Chicago bitmap glyphs need the room.
          //   - Modern: matches the row height (24px) so the silver
          //     header reads as part of the same list rhythm.
          //   - Zune: same 24px rhythm; flat black strip with a faint
          //     1px white hairline below it.
          "shrink-0 py-0 px-2 flex items-center sticky top-0 z-10",
          isZuneUi
            ? "ipod-zune-titlebar text-white font-ipod-zune-ui text-[14px] font-semibold lowercase tracking-tight"
            : isModernUi
            ? "ipod-modern-titlebar text-black font-ipod-modern-ui text-[15px] font-semibold"
            : "h-6 min-h-6 border-b border-[#0a3667] font-chicago text-[16px] text-[#0a3667] [text-shadow:1px_1px_0_rgba(0,0,0,0.15)]"
        )}
        style={
          isZuneUi
            ? {
                height: ZUNE_TITLEBAR_HEIGHT,
                minHeight: ZUNE_TITLEBAR_HEIGHT,
              }
            : isModernUi
            ? {
                height: MODERN_TITLEBAR_HEIGHT,
                minHeight: MODERN_TITLEBAR_HEIGHT,
              }
            : undefined
        }
      >
        <div
          className={cn(
            "flex items-center justify-start",
            isZuneUi
              ? "w-6 font-ipod-zune-ui text-[13px] font-semibold text-white/90"
              : isModernUi
              ? "w-6 font-ipod-modern-ui font-semibold text-[15px] text-black/80"
              : `w-6 font-chicago ${isPlaying ? "text-xs" : "text-[18px]"}`
          )}
        >
          <div
            className={cn(
              "flex items-center justify-center",
              isZuneUi ? "w-4 h-4" : isModernUi ? "w-4 h-4" : "w-4 h-4 mt-0.5"
            )}
          >
            {isPlaying ? "▶" : "⏸︎"}
          </div>
        </div>
        <ScrollingText
          text={titlebarTitle}
          isPlaying
          scrollStartDelaySec={1}
          fadeEdges={isModernUi || isZuneUi}
          className={cn(
            "flex-1 min-w-0 px-1 text-center leading-none",
            isZuneUi &&
              "font-ipod-zune-ui text-[14px] font-semibold text-white lowercase tracking-tight",
            isModernUi &&
              cn(
                "font-ipod-modern-ui text-[15px] font-semibold",
                "[text-shadow:0_1px_0_rgba(255,255,255,0.9)]"
              )
          )}
        />
        <div className="flex w-6 items-center justify-end">
          <BatteryIndicator backlightOn={backlightOn} variant={uiVariant} />
        </div>
      </div>

      {/* Content area - z-30 only when video is not showing so it can
          receive events. Content height subtracts the titlebar height
          so the menu/now-playing area is the same in both skins. */}
      <div
        className={cn(
          "relative",
          !showVideo && "z-30"
        )}
        style={{
          height: isZuneUi
            ? `calc(100% - ${ZUNE_TITLEBAR_HEIGHT}px)`
            : isModernUi
            ? `calc(100% - ${MODERN_TITLEBAR_HEIGHT}px)`
            : "calc(100% - 24px)",
        }}
      >
        <AnimatePresence initial={false} custom={menuDirection} mode="sync">
          {menuMode ? (
            <motion.div
              key={`menu-${menuHistory.length}-${currentMenuTitle}`}
              className="absolute inset-0 flex flex-col h-full"
              initial="enter"
              animate="center"
              exit="exit"
              variants={menuVariants}
              transition={{ duration: 0.2, ease: "easeInOut" }}
              custom={menuDirection}
            >
              <div className="flex-1 relative">
                <div
                  ref={setMenuScrollRef}
                  className="absolute inset-0 overflow-auto ipod-menu-container"
                >
                  <div
                    style={{
                      position: "relative",
                      height: currentMenuItems.length * menuItemHeight,
                    }}
                  >
                    {currentMenuItems
                      .slice(visibleRange.start, visibleRange.end)
                      .map((item, i) => {
                        const index = visibleRange.start + i;
                        return (
                          <div
                            key={index}
                            className={`ipod-menu-item ${
                              index === selectedMenuItem ? "selected" : ""
                            }`}
                            style={{
                              position: "absolute",
                              top: index * menuItemHeight,
                              left: 0,
                              right: 0,
                              height: menuItemHeight,
                            }}
                          >
                            <MenuListItem
                              text={item.label}
                              isSelected={index === selectedMenuItem}
                              backlightOn={backlightOn}
                              variant={uiVariant}
                              onClick={() => {
                                onSelectMenuItem(index);
                                onMenuItemAction(item.action);
                              }}
                              showChevron={item.showChevron !== false}
                              value={item.value}
                              isLoading={item.isLoading}
                            />
                          </div>
                        );
                      })}
                  </div>
                </div>
                <Scrollbar
                  containerRef={menuScrollRef}
                  backlightOn={backlightOn}
                  menuMode={menuMode}
                  variant={uiVariant}
                />
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="nowplaying"
              className="absolute inset-0 flex flex-col h-full"
              initial="enter"
              animate="center"
              exit="exit"
              variants={menuVariants}
              transition={{ duration: 0.2, ease: "easeInOut" }}
              custom={menuDirection}
              onClick={() => {
                if (!menuMode && currentTrack) {
                  registerActivity();
                  if (!isPlaying) {
                    if (!showVideo) {
                      onToggleVideo();
                      setTimeout(() => {
                        handlePlay();
                      }, 100);
                    } else {
                      handlePlay();
                    }
                  } else {
                    onToggleVideo();
                  }
                }
              }}
            >
              <div
                className={cn(
                  "flex-1 flex flex-col overflow-visible px-2",
                  isZuneUi ? "pt-1.5 pb-0.5" : isModernUi ? "pt-1.5 pb-0.5" : "py-1"
                )}
              >
                {currentTrack && nowPlayingDisplayTrack ? (
                  <>
                    <div
                      className={cn(
                        "flex items-center justify-between gap-2",
                        isZuneUi
                          ? "font-ipod-zune-ui text-[11px] font-normal leading-[1.06] text-white/60 lowercase tracking-tight"
                          : isModernUi
                          ? "font-ipod-modern-ui text-[12px] font-normal leading-[1.06] text-[rgb(99,101,103)]"
                          : "font-chicago text-[12px] text-[#0a3667] [text-shadow:1px_1px_0_rgba(0,0,0,0.15)]",
                        nowPlayingDisplayTrack.album ? "mb-1" : "mb-1.5"
                      )}
                    >
                      <span>
                        {currentTrack?.appleMusicPlayParams?.stationId
                          ? isZuneUi
                            ? "live"
                            : "LIVE"
                          : isAppleMusicCollectionShell
                            ? isZuneUi
                              ? "mix"
                              : "MIX"
                            : isZuneUi
                              ? `${currentIndex + 1} of ${tracksLength}`
                              : `${currentIndex + 1} of ${tracksLength}`}
                      </span>
                      {isShuffled && (
                        <Shuffle
                          className="shrink-0"
                          size={isZuneUi ? 12 : isModernUi ? 12 : 13}
                          weight="bold"
                          aria-label="shuffle on"
                        />
                      )}
                    </div>
                    {isZuneUi ? (
                      <div className="flex min-h-0 flex-1 items-start gap-3 overflow-visible pt-1 pb-0">
                        {/* Zune now-playing artwork: hard-edged square sleeve, no
                            reflection — Zune showed flat covers, not Cover Flow. */}
                        <div
                          className="relative shrink-0 self-start overflow-hidden bg-neutral-900"
                          style={{
                            width: MODERN_NOW_PLAYING_ART_PX,
                            height: MODERN_NOW_PLAYING_ART_PX,
                          }}
                        >
                          {coverUrl ? (
                            <img
                              src={coverUrl}
                              alt=""
                              draggable={false}
                              className="size-full object-cover"
                            />
                          ) : (
                            <div className="flex size-full items-center justify-center text-[22px] leading-none text-white/30 select-none">
                              ♪
                            </div>
                          )}
                        </div>
                        <div
                          className={cn(
                            "flex min-h-0 min-w-0 flex-1 flex-col justify-start gap-0 overflow-visible text-left",
                            "[&>*]:py-0",
                            "[&>*:not(:first-child)]:-mt-[2px]",
                            "font-ipod-zune-ui"
                          )}
                        >
                          <ScrollingText
                            text={nowPlayingDisplayTrack.title}
                            isPlaying={isPlaying}
                            scrollStartDelaySec={1}
                            align="left"
                            fadeEdges
                            className="leading-[1.08] text-[16px] font-semibold text-white lowercase tracking-tight"
                          />
                          <ScrollingText
                            text={nowPlayingDisplayTrack.artist || ""}
                            isPlaying={isPlaying}
                            scrollStartDelaySec={1}
                            align="left"
                            fadeEdges
                            className="leading-[1.08] text-[12px] font-normal text-white/65 lowercase tracking-tight"
                          />
                          {nowPlayingDisplayTrack.album && (
                            <ScrollingText
                              text={nowPlayingDisplayTrack.album}
                              isPlaying={isPlaying}
                              scrollStartDelaySec={1}
                              align="left"
                              fadeEdges
                              className="leading-[1.08] text-[12px] font-normal text-white/45 lowercase tracking-tight"
                            />
                          )}
                        </div>
                      </div>
                    ) : isModernUi ? (
                      <div className="flex min-h-0 flex-1 items-start gap-3 overflow-visible pt-1 pb-0">
                        <ModernNowPlayingArtwork coverUrl={coverUrl} />
                        <div
                          className={cn(
                            "flex min-h-0 min-w-0 flex-1 flex-col justify-start gap-0 overflow-visible text-left",
                            "[&>*]:py-0",
                            "[&>*:not(:first-child)]:-mt-[3px]",
                            "font-ipod-modern-ui"
                          )}
                        >
                          <ScrollingText
                            text={nowPlayingDisplayTrack.title}
                            isPlaying={isPlaying}
                            scrollStartDelaySec={1}
                            align="left"
                            fadeEdges
                            className="leading-[1.06] text-[15px] font-semibold text-black"
                          />
                          <ScrollingText
                            text={nowPlayingDisplayTrack.artist || ""}
                            isPlaying={isPlaying}
                            scrollStartDelaySec={1}
                            align="left"
                            fadeEdges
                            className="leading-[1.06] text-[12px] font-normal text-[rgb(99,101,103)]"
                          />
                          {nowPlayingDisplayTrack.album && (
                            <ScrollingText
                              text={nowPlayingDisplayTrack.album}
                              isPlaying={isPlaying}
                              scrollStartDelaySec={1}
                              align="left"
                              fadeEdges
                              className="leading-[1.06] text-[12px] font-normal text-[rgb(99,101,103)]"
                            />
                          )}
                        </div>
                      </div>
                    ) : (
                      <div
                        className={cn(
                          "flex min-h-0 flex-col gap-0 overflow-visible text-center leading-[1.05]",
                          "font-chicago text-[16px] text-[#0a3667] [text-shadow:1px_1px_0_rgba(0,0,0,0.15)]"
                        )}
                      >
                        <ScrollingText
                          text={nowPlayingDisplayTrack.title}
                          isPlaying={isPlaying}
                          scrollStartDelaySec={1}
                          className="leading-[1.05] py-px"
                        />
                        <ScrollingText
                          text={nowPlayingDisplayTrack.artist || ""}
                          isPlaying={isPlaying}
                          scrollStartDelaySec={1}
                          className="leading-[1.05] py-px"
                        />
                        {nowPlayingDisplayTrack.album && (
                          <ScrollingText
                            text={nowPlayingDisplayTrack.album}
                            isPlaying={isPlaying}
                            scrollStartDelaySec={1}
                            className="leading-[1.05] py-px"
                          />
                        )}
                      </div>
                    )}
                    <div
                      className={cn(
                        "mt-auto flex-shrink-0 w-full",
                        nowPlayingDisplayTrack.album ? "pt-1.5" : "pt-3"
                      )}
                    >
                      {isZuneUi ? (
                        // Thin Zune progress bar — flat hairline track with
                        // a magenta accent fill (Zune's signature pink).
                        <div className="ipod-zune-progress h-[3px] w-full overflow-hidden">
                          <div
                            className="ipod-zune-progress-fill h-full transition-all duration-200 ease-out"
                            style={{
                              width: `${
                                totalTime > 0
                                  ? (elapsedTime / totalTime) * 100
                                  : 0
                              }%`,
                            }}
                          />
                        </div>
                      ) : isModernUi ? (
                        // Same aqua bar as About This Finder memory rows.
                        <div className="aqua-progress h-[9px] w-full rounded-none">
                          <div
                            className="aqua-progress-fill h-full rounded-none transition-all duration-200 ease-out"
                            style={{
                              width: `${
                                totalTime > 0
                                  ? (elapsedTime / totalTime) * 100
                                  : 0
                              }%`,
                            }}
                          />
                        </div>
                      ) : (
                        <div className="w-full h-[8px] rounded-full border border-[#0a3667] overflow-hidden">
                          <div
                            className="h-full bg-[#0a3667]"
                            style={{
                              width: `${
                                totalTime > 0
                                  ? (elapsedTime / totalTime) * 100
                                  : 0
                              }%`,
                            }}
                          />
                        </div>
                      )}
                      <div
                        className={cn(
                          "w-full flex justify-between",
                          isZuneUi
                            ? "font-ipod-zune-ui text-[11px] min-h-[14px] leading-[1.06] mt-1 text-white/55 font-normal tabular-nums lowercase tracking-tight"
                            : isModernUi
                            ? "font-ipod-modern-ui text-[12px] min-h-[14px] leading-[1.06] mt-1 text-[rgb(99,101,103)] font-normal tabular-nums"
                            : "font-chicago text-[16px] h-[22px] text-[#0a3667] [text-shadow:1px_1px_0_rgba(0,0,0,0.15)]"
                        )}
                      >
                        <span>
                          {formatPlaybackTime(displayElapsedSeconds)}
                        </span>
                        <span>-{formatPlaybackTime(displayRemainingSeconds)}</span>
                      </div>
                    </div>
                  </>
                ) : (
                  <div
                    className={cn(
                      "text-center h-full flex flex-col justify-center items-center",
                      isZuneUi
                        ? "font-ipod-zune-ui text-[14px] text-white/55 lowercase tracking-tight"
                        : isModernUi
                        ? "font-ipod-modern-ui text-[15px] text-[rgb(99,101,103)]"
                        : "font-geneva-12 text-[12px] text-[#0a3667] [text-shadow:1px_1px_0_rgba(0,0,0,0.15)]"
                    )}
                  >
                    <p>Don't steal music</p>
                    <p>Ne volez pas la musique</p>
                    <p>Bitte keine Musik stehlen</p>
                    <p>音楽を盗用しないでください</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

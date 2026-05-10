import {
  useRef,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  useCallback,
} from "react";
import ReactPlayer from "react-player";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { useAudioSettingsStore } from "@/stores/useAudioSettingsStore";
import { LyricsDisplay } from "./LyricsDisplay";
import { AppleMusicPlayerBridge } from "./AppleMusicPlayerBridge";
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

// Fixed row height for the iPod menu list. Each `MenuListItem` is a
// single-line `font-chicago text-[16px]` row; 24px gives a touch more
// vertical breathing room than the font's natural height while keeping
// the same number of rows on-screen as the classic iPod (~5 rows in
// the 124px menu area).
//
// We virtualize EVERY menu — not just huge ones — so item geometry
// stays identical across the main menu, the artist list, and the
// thousands-long All Songs list. Without this, the All Songs view
// (virtualized at a fixed height) would render at a different row size
// than the surrounding menus (whose rows used the font's natural
// height) and the menu would visibly "shrink" when entering it.
const MENU_ITEM_HEIGHT = 24;
// Render this many extra items above and below the visible window so
// scrolling doesn't reveal blank rows before React reconciles.
const OVERSCAN_ITEMS = 6;

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
  const effectiveDisplayMode =
    isAppleMusicTrack && displayMode === DisplayMode.Video
      ? DisplayMode.Cover
      : displayMode;
  const shouldAnimateVisuals = showVideo && isPlaying;

  // Cover URL for paused state overlay
  const coverUrl = useMemo(() => {
    if (!currentTrack) return null;
    if (isAppleMusicTrack) {
      // Apple Music supplies an https URL directly; no Kugou template here.
      return currentTrack.cover ?? null;
    }
    const videoId = getYouTubeVideoId(currentTrack.url);
    const youtubeThumbnail = videoId
      ? `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
      : null;
    return formatKugouImageUrl(currentTrack.cover, 400) ?? youtubeThumbnail;
  }, [currentTrack, isAppleMusicTrack]);

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
      Math.floor(scrollTop / MENU_ITEM_HEIGHT) - OVERSCAN_ITEMS
    );
    const visibleCount =
      Math.ceil((containerHeight || 124) / MENU_ITEM_HEIGHT) +
      OVERSCAN_ITEMS * 2;
    const end = Math.min(currentMenuItems.length, start + visibleCount);
    return { start, end };
  }, [scrollTop, containerHeight, currentMenuItems.length]);

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
      const itemTop = safeIndex * MENU_ITEM_HEIGHT;
      const itemBottom = itemTop + MENU_ITEM_HEIGHT;
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
    const itemTop = selectedMenuItem * MENU_ITEM_HEIGHT;
    const itemBottom = itemTop + MENU_ITEM_HEIGHT;
    const visibleTop = el.scrollTop;
    const visibleBottom = visibleTop + containerH;
    if (itemBottom > visibleBottom) {
      el.scrollTop = itemBottom - containerH;
    } else if (itemTop < visibleTop) {
      el.scrollTop = itemTop;
    }
  }, [menuMode, selectedMenuItem, menuHistory, currentMenuItems]);

  const shouldShowLyrics = showLyrics;

  return (
    <div
      className={cn(
        "relative w-full h-[150px] border border-black border-2 rounded-[2px] overflow-hidden transition-all duration-500 select-none no-select-all",
        lcdFilterOn ? "lcd-screen" : "",
        backlightOn
          ? "bg-[#c5e0f5] bg-gradient-to-b from-[#d1e8fa] to-[#e0f0fc]"
          : "bg-[#8a9da9] contrast-65 saturate-50",
        lcdFilterOn &&
          backlightOn &&
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
      {/* LCD screen overlay with scan lines */}
      {lcdFilterOn && (
        <div className="absolute inset-0 pointer-events-none z-25 lcd-scan-lines"></div>
      )}

      {/* Glass reflection effect */}
      {lcdFilterOn && (
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
                  <StatusDisplay message={statusMessage} />
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
      <div className="border-b border-[#0a3667] py-0 px-2 font-chicago text-[16px] flex items-center sticky top-0 z-10 text-[#0a3667] [text-shadow:1px_1px_0_rgba(0,0,0,0.15)]">
        <div
          className={`w-6 flex items-center justify-start font-chicago ${
            isPlaying ? "text-xs" : "text-[18px]"
          }`}
        >
          <div className="w-4 h-4 mt-0.5 flex items-center justify-center">
            {isPlaying ? "▶" : "⏸︎"}
          </div>
        </div>
        <div className="flex-1 truncate text-center">{currentMenuTitle}</div>
        <div className="w-6 flex items-center justify-end">
          <BatteryIndicator backlightOn={backlightOn} />
        </div>
      </div>

      {/* Content area - z-30 only when video is not showing so it can receive events */}
      <div className={cn("relative h-[calc(100%-26px)]", !showVideo && "z-30")}>
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
                      height: currentMenuItems.length * MENU_ITEM_HEIGHT,
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
                              top: index * MENU_ITEM_HEIGHT,
                              left: 0,
                              right: 0,
                              height: MENU_ITEM_HEIGHT,
                            }}
                          >
                            <MenuListItem
                              text={item.label}
                              isSelected={index === selectedMenuItem}
                              backlightOn={backlightOn}
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
              <div className="flex-1 flex flex-col p-1 px-2 overflow-auto">
                {currentTrack ? (
                  <>
                    <div
                      className={cn(
                        "font-chicago text-[12px] text-[#0a3667] [text-shadow:1px_1px_0_rgba(0,0,0,0.15)]",
                        currentTrack.album ? "mb-0" : "mb-1"
                      )}
                    >
                      {currentIndex + 1} of {tracksLength}
                    </div>
                    <div className="font-chicago text-[16px] text-center text-[#0a3667] [text-shadow:1px_1px_0_rgba(0,0,0,0.15)] flex flex-col gap-px leading-snug min-h-0 overflow-visible">
                      <ScrollingText
                        text={currentTrack.title}
                        isPlaying={isPlaying}
                        scrollStartDelaySec={1}
                        className="leading-snug pb-px -mb-px"
                      />
                      <ScrollingText
                        text={currentTrack.artist || ""}
                        isPlaying={isPlaying}
                        scrollStartDelaySec={1}
                        className="leading-snug pb-px -mb-px"
                      />
                      {currentTrack.album && (
                        <ScrollingText
                          text={currentTrack.album}
                          isPlaying={isPlaying}
                          scrollStartDelaySec={1}
                          className="leading-snug pb-px -mb-px"
                        />
                      )}
                    </div>
                    <div className="mt-auto pt-3 flex-shrink-0 w-full">
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
                      <div className="font-chicago text-[16px] w-full h-[22px] flex justify-between text-[#0a3667] [text-shadow:1px_1px_0_rgba(0,0,0,0.15)]">
                        <span>
                          {Math.floor(elapsedTime / 60)}:
                          {String(Math.floor(elapsedTime % 60)).padStart(
                            2,
                            "0"
                          )}
                        </span>
                        <span>
                          -{Math.floor((totalTime - elapsedTime) / 60)}:
                          {String(
                            Math.floor((totalTime - elapsedTime) % 60)
                          ).padStart(2, "0")}
                        </span>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-center font-geneva-12 text-[12px] text-[#0a3667] [text-shadow:1px_1px_0_rgba(0,0,0,0.15)] h-full flex flex-col justify-center items-center">
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

import { useRef, useEffect, useMemo, useCallback } from "react";
import ReactPlayer from "react-player";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { useAudioSettingsStore } from "@/stores/useAudioSettingsStore";
import { LyricsDisplay } from "./LyricsDisplay";
import { ActivityIndicatorWithLabel } from "@/components/ui/activity-indicator-with-label";
import { useTranslation } from "react-i18next";
import {
  BatteryIndicator,
  Scrollbar,
  MenuListItem,
  ScrollingText,
  StatusDisplay,
} from "./screen";
import { getYouTubeVideoId, formatKugouImageUrl } from "../constants";
import { DisplayMode } from "@/types/lyrics";
import { LandscapeVideoBackground } from "@/components/shared/LandscapeVideoBackground";
import type { IpodScreenProps } from "../types";

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
      ? menuHistory[menuHistory.length - 1].title
      : t("apps.ipod.menuItems.ipod")
    : t("apps.ipod.menuItems.nowPlaying");

  // Refs
  const menuScrollRef = useRef<HTMLDivElement>(null);
  const menuItemsRef = useRef<(HTMLDivElement | null)[]>([]);
  const needScrollRef = useRef(false);

  const masterVolume = useAudioSettingsStore((s) => s.masterVolume);
  const finalIpodVolume = ipodVolume * masterVolume;

  // Cover URL for paused state overlay
  const coverUrl = useMemo(() => {
    if (!currentTrack) return null;
    const videoId = getYouTubeVideoId(currentTrack.url);
    const youtubeThumbnail = videoId
      ? `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
      : null;
    return formatKugouImageUrl(currentTrack.cover, 400) ?? youtubeThumbnail;
  }, [currentTrack]);

  // Reset refs when menu items change
  const resetItemRefs = (count: number) => {
    menuItemsRef.current = Array(count).fill(null);
  };

  // Scroll to selected item
  const forceScrollToSelected = useCallback(() => {
    if (!menuMode || menuHistory.length === 0) return;

    const container = document.querySelector(
      ".ipod-menu-container"
    ) as HTMLElement;
    if (!container) return;

    const menuItems = Array.from(container.querySelectorAll(".ipod-menu-item"));
    if (!menuItems.length) return;

    if (selectedMenuItem < 0 || selectedMenuItem >= menuItems.length) return;

    const selectedItem = menuItems[selectedMenuItem] as HTMLElement;
    if (!selectedItem) return;

    const containerHeight = container.clientHeight;
    const itemTop = selectedItem.offsetTop;
    const itemHeight = selectedItem.offsetHeight;
    const scrollTop = container.scrollTop;
    const buffer = 2;

    if (itemTop + itemHeight > scrollTop + containerHeight - buffer) {
      container.scrollTo({
        top: itemTop + itemHeight - containerHeight + buffer,
        behavior: "instant" as ScrollBehavior,
      });
    } else if (itemTop < scrollTop + buffer) {
      container.scrollTo({
        top: Math.max(0, itemTop - buffer),
        behavior: "instant" as ScrollBehavior,
      });
    }

    if (selectedMenuItem === 0) {
      container.scrollTo({
        top: 0,
        behavior: "instant" as ScrollBehavior,
      });
    }

    if (selectedMenuItem === menuItems.length - 1) {
      container.scrollTo({
        top: Math.max(0, itemTop - (containerHeight - itemHeight) + buffer),
        behavior: "instant" as ScrollBehavior,
      });
    }

    needScrollRef.current = false;
  }, [menuMode, menuHistory, selectedMenuItem]);

  // Trigger scroll on various conditions
  useEffect(() => {
    if (menuMode && menuHistory.length > 0) {
      needScrollRef.current = true;
      forceScrollToSelected();

      const attempts = [50, 100, 250, 500, 1000];
      attempts.forEach((delay) => {
        setTimeout(() => {
          if (needScrollRef.current) {
            forceScrollToSelected();
          }
        }, delay);
      });
    }
  }, [menuMode, selectedMenuItem, menuHistory, forceScrollToSelected]);

  // Prepare for a newly opened menu
  useEffect(() => {
    if (menuMode && menuHistory.length > 0) {
      const currentMenu = menuHistory[menuHistory.length - 1];
      resetItemRefs(currentMenu.items.length);
    }
  }, [menuMode, menuHistory]);

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
            {/* YouTube player - hidden when display mode is not Video (still provides audio) */}
            <div style={displayMode !== DisplayMode.Video ? { visibility: "hidden", pointerEvents: "none" } : undefined}>
              <ReactPlayer
                ref={playerRef}
                url={currentTrack.url}
                playing={isPlaying}
                controls={showVideo && displayMode === DisplayMode.Video}
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
                progressInterval={100}
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

            {/* Landscape video background */}
            {displayMode === DisplayMode.Landscapes && (
              <LandscapeVideoBackground
                isActive={showVideo}
                className="absolute inset-0 z-[5]"
              />
            )}

            {/* Dark overlay when lyrics are shown */}
            {showVideo && shouldShowLyrics && (
              <div className="absolute inset-0 bg-black/30 z-25" />
            )}
            {/* Cover overlay: shows when paused (any mode) or always in Cover mode */}
            <AnimatePresence>
              {showVideo && coverUrl && (displayMode === DisplayMode.Cover || !isPlaying) && (
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
              onAnimationComplete={() => {
                needScrollRef.current = true;
                forceScrollToSelected();
              }}
            >
              <div className="flex-1 relative">
                <div
                  ref={menuScrollRef}
                  className="absolute inset-0 overflow-auto ipod-menu-container"
                >
                  {menuHistory.length > 0 &&
                    menuHistory[menuHistory.length - 1].items.map(
                      (item, index) => (
                        <div
                          key={index}
                          ref={(el) => {
                            menuItemsRef.current[index] = el;
                          }}
                          className={`ipod-menu-item ${
                            index === selectedMenuItem ? "selected" : ""
                          }`}
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
                          />
                        </div>
                      )
                    )}
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
                    <div className="font-chicago text-[12px] mb-1 text-[#0a3667] [text-shadow:1px_1px_0_rgba(0,0,0,0.15)]">
                      {currentIndex + 1} of {tracksLength}
                    </div>
                    <div className="font-chicago text-[16px] text-center text-[#0a3667] [text-shadow:1px_1px_0_rgba(0,0,0,0.15)]">
                      <ScrollingText
                        text={currentTrack.title}
                        isPlaying={isPlaying}
                      />
                      <ScrollingText
                        text={currentTrack.artist || ""}
                        isPlaying={isPlaying}
                      />
                    </div>
                    <div className="mt-auto w-full h-[8px] rounded-full border border-[#0a3667] overflow-hidden">
                      <div
                        className="h-full bg-[#0a3667]"
                        style={{
                          width: `${
                            totalTime > 0 ? (elapsedTime / totalTime) * 100 : 0
                          }%`,
                        }}
                      />
                    </div>
                    <div className="font-chicago text-[16px] w-full h-[22px] flex justify-between text-[#0a3667] [text-shadow:1px_1px_0_rgba(0,0,0,0.15)]">
                      <span>
                        {Math.floor(elapsedTime / 60)}:
                        {String(Math.floor(elapsedTime % 60)).padStart(2, "0")}
                      </span>
                      <span>
                        -{Math.floor((totalTime - elapsedTime) / 60)}:
                        {String(
                          Math.floor((totalTime - elapsedTime) % 60)
                        ).padStart(2, "0")}
                      </span>
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
